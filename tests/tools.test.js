// Logic tests for the tool layer and store queries. Run with:
//   node --test tests/
// No dependencies; the store runs in memory because localStorage is absent
// under Node.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decideApproval,
  getApproval,
  getState,
  loadState,
  logActivity,
  logTouchpoint,
  pendingApprovals,
  pipelineStats,
  queueApproval,
  resetState,
  searchLeads,
  staleDaysOf,
} from '../js/store.js';
import { TOOLS, runTool } from '../js/tools.js';

test.beforeEach(() => resetState());

test('seed produces a realistic board', () => {
  const state = loadState();
  assert.ok(state.leads.length >= 10);
  for (const lead of state.leads) {
    assert.match(lead.id, /^L-\d{3}$/);
    assert.ok(lead.value > 0);
    assert.ok(lead.timeline.length >= 1);
  }
});

test('schema shape: every tool is valid for registerTool', () => {
  assert.ok(TOOLS.length >= 10);
  const names = new Set();
  for (const tool of TOOLS) {
    assert.equal(typeof tool.name, 'string');
    assert.ok(tool.name.length <= 64, 'MCP names stay short');
    assert.ok(!names.has(tool.name), 'names are unique');
    names.add(tool.name);
    assert.equal(typeof tool.description, 'string');
    assert.ok(tool.description.length > 30, 'descriptions carry real guidance');
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(typeof tool.execute, 'function');
    assert.equal(typeof tool.annotations.readOnlyHint, 'boolean');
  }
});

test('get_pipeline_overview returns stats and ui state', async () => {
  const { result } = await runTool('get_pipeline_overview', {});
  assert.equal(result.openDeals, getState().leads.filter((l) => !['won', 'lost'].includes(l.stage)).length);
  assert.equal(typeof result.openValue, 'number');
  assert.equal(result.ui_state.view, 'board');
  assert.ok('hint' in result);
});

test('search_leads filters by stage, value, staleness and text', async () => {
  const all = await runTool('search_leads', {});
  assert.ok(all.result.count > 0);

  const qualified = await runTool('search_leads', { stage: 'qualified' });
  for (const lead of qualified.result.leads) assert.equal(lead.stage, 'qualified');

  const valuable = await runTool('search_leads', { minValue: 20000 });
  for (const lead of valuable.result.leads) assert.ok(lead.value_eur >= 20000);

  const stale = await runTool('search_leads', { staleDays: 14 });
  for (const lead of stale.result.leads) assert.ok(lead.days_since_last_touch >= 14);

  const text = await runTool('search_leads', { query: 'porzellan' });
  assert.equal(text.result.count, 1);
  assert.equal(text.result.leads[0].company, 'Mahlwerck Porzellan GmbH');

  const values = all.result.leads.map((lead) => lead.value_eur);
  assert.deepEqual(values, [...values].sort((a, b) => b - a), 'sorted by value desc');
});

test('get_lead returns full profile with timeline', async () => {
  const first = getState().leads[0];
  const { result } = await runTool('get_lead', { leadId: first.id });
  assert.equal(result.id, first.id);
  assert.ok(Array.isArray(result.timeline));
  assert.ok(result.timeline.length >= 1);
});

test('get_lead rejects unknown ids with a helpful error', async () => {
  const outcome = await runTool('get_lead', { leadId: 'L-999' });
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /search_leads/);
});

test('find_stale_leads sorts by value and respects threshold', async () => {
  const { result } = await runTool('find_stale_leads', { staleDays: 14 });
  for (const lead of result.leads) assert.ok(lead.days_since_last_touch >= 14);
  const values = result.leads.map((lead) => lead.value_eur);
  assert.deepEqual(values, [...values].sort((a, b) => b - a));
});

test('add_lead creates a lead and the card is flagged as agent work', async () => {
  const { result } = await runTool('add_lead', {
    company: 'Testwerk GmbH',
    contact: 'Ada Test',
    value: 9000,
    note: 'Came up in a call.',
  });
  assert.equal(result.created, true);
  assert.equal(result.lead.company, 'Testwerk GmbH');
  const stored = getState().leads.find((lead) => lead.id === result.lead.id);
  assert.equal(stored.source, 'agent');
  assert.ok(stored.timeline.some((entry) => entry.summary.includes('Created in stage')));
});

test('log_touchpoint refreshes the staleness clock', async () => {
  const lead = searchLeads({ staleDays: 20 })[0];
  const before = staleDaysOf(lead);
  const { result } = await runTool('log_touchpoint', {
    leadId: lead.id,
    type: 'call',
    summary: 'Caught them on the phone.',
  });
  assert.ok(result.logged);
  assert.equal(result.lead.days_since_last_touch, 0);
  assert.ok(before >= 20);
});

test('move_lead validates stages and records the transition', async () => {
  const lead = getState().leads.find((entry) => entry.stage === 'contacted');
  const { result } = await runTool('move_lead', { leadId: lead.id, stage: 'qualified' });
  assert.equal(result.lead.stage, 'qualified');
  assert.ok(getLeadTimeline(lead.id).some((entry) => entry.summary.includes('contacted → qualified')));

  const bad = await runTool('move_lead', { leadId: lead.id, stage: 'paradise' });
  assert.equal(bad.ok, false);
});

test('schedule_followup requires ISO dates', async () => {
  const lead = getState().leads[0];
  const ok = await runTool('schedule_followup', { leadId: lead.id, date: '2026-09-10', note: 'Call back' });
  assert.equal(ok.result.lead.next_step.date, '2026-09-10');

  const bad = await runTool('schedule_followup', { leadId: lead.id, date: 'next tuesday' });
  assert.equal(bad.ok, false);
});

test('draft_followup queues for approval and never mutates the lead', async () => {
  const lead = getState().leads[0];
  const stageBefore = lead.stage;
  const timelineBefore = lead.timeline.length;

  const { result } = await runTool('draft_followup', {
    leadId: lead.id,
    channel: 'email',
    message: 'Hello, following up on our last call — is this still on the table?',
  });
  assert.equal(result.queued, true);
  assert.equal(result.status, 'pending');
  assert.match(result.note, /Nothing has been sent/);

  const stored = getState().leads.find((entry) => entry.id === lead.id);
  assert.equal(stored.stage, stageBefore, 'lead untouched');
  assert.equal(stored.timeline.length, timelineBefore, 'no timeline entry from drafting');

  const pending = pendingApprovals();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].requester, 'agent');
});

test('approval round trip: pending → edited, visible to get_approval', async () => {
  const lead = getState().leads[0];
  const { result } = await runTool('draft_followup', {
    leadId: lead.id,
    message: 'Draft text, ready to send.',
  });

  let status = await runTool('get_approval', { approvalId: result.approval_id });
  assert.equal(status.result.status, 'pending');
  assert.match(status.result.guidance, /waiting/i);

  decideApproval(result.approval_id, 'edited', { message: 'Revised by the human.' });
  status = await runTool('get_approval', { approvalId: result.approval_id });
  assert.equal(status.result.status, 'edited');
  assert.equal(status.result.human_message, 'Revised by the human.');
  assert.match(status.result.guidance, /revised/i);
});

test('approval round trip: rejected', () => {
  const lead = getState().leads[0];
  const approval = queueApproval({ leadId: lead.id, message: 'x'.repeat(30) });
  decideApproval(approval.id, 'rejected');
  assert.equal(getApproval(approval.id).status, 'rejected');
  assert.equal(pendingApprovals().length, 0);
});

test('get_recent_activity shows agent and human entries', async () => {
  const lead = getState().leads[0];
  await runTool('log_touchpoint', { leadId: lead.id, type: 'note', summary: 'Agent note.' });
  logTouchpoint(lead.id, { type: 'call', summary: 'Human note.', actor: 'human' });
  logActivity({ actor: 'human', summary: 'call: caught them at the office', leadId: lead.id });

  const { result } = await runTool('get_recent_activity', { limit: 5 });
  assert.ok(result.count >= 2);
  const actors = result.entries.map((entry) => entry.actor);
  assert.ok(actors.includes('agent'));
  assert.ok(actors.includes('human'));
});

test('pipelineStats counts stale and pending approvals', () => {
  const stats = pipelineStats();
  assert.equal(stats.pendingApprovals, 0);
  assert.ok(stats.openValue > 0);
  assert.ok(stats.byStage.new.count >= 1);
});

function getLeadTimeline(leadId) {
  return getState().leads.find((lead) => lead.id === leadId).timeline;
}
