// Demo agent: a scripted stand-in for a real WebMCP agent. It walks the exact
// tool path an agent would take — including the human approval gate — so the
// full story is demoable in any browser. Every step appears in the activity
// feed; it never touches the pipeline outside the tools.

import { runTool } from './tools.js';
import { getApproval, logActivity } from './store.js';
import { focusTab, setBusyBadge, toast } from './ui.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let running = false;

export function initDemoAgent() {
  document.getElementById('btn-demo').addEventListener('click', runScenario);
}

// Narration entries carry no tool call; they render as agent lines in the feed.
function narrate(text) {
  logActivity({ actor: 'agent', tool: 'demo-agent', summary: text });
  return wait(0);
}

async function runScenario() {
  if (running) return;
  running = true;
  setBusyBadge(true);
  const button = document.getElementById('btn-demo');
  button.disabled = true;

  try {
    await narrate('Good morning. Let me look at the pipeline first.');
    await wait(500);
    const overview = await call('get_pipeline_overview', {});
    if (!overview.ok) throw new Error(overview.error);
    await narrate(
      `${overview.result.openDeals} open deals worth €${overview.result.openValue.toLocaleString('en-US')}. ` +
      `${overview.result.staleCount} have gone quiet for 14+ days — that’s where I can help.`,
    );
    await wait(700);

    const stale = await call('find_stale_leads', { staleDays: 14, limit: 5 });
    if (!stale.ok) throw new Error(stale.error);
    if (!stale.result.count) {
      await narrate('Actually, nothing is stale right now. The pipeline is well tended — nice.');
      return;
    }
    const top = stale.result.leads[0];
    await narrate(`The most valuable neglected deal: ${top.company} (${top.id}), €${top.value_eur.toLocaleString('en-US')}, ` +
      `untouched for ${top.days_since_last_touch} days. Let me read the history before I write anything.`);
    await wait(700);

    const detail = await call('get_lead', { leadId: top.id });
    if (!detail.ok) throw new Error(detail.error);
    const lead = detail.result;
    const context = lead.notes[0] || lead.timeline.length ? 'previous conversation' : 'your industry';

    await wait(600);
    await narrate(`Drafting a follow-up for ${lead.contact || lead.company} — based on ${context}. Queuing it for human review, NOT sending.`);
    const draft = await call('draft_followup', {
      leadId: lead.id,
      channel: 'email',
      message: buildDraft(lead),
    });
    if (!draft.ok) throw new Error(draft.error);

    focusTab('approvals');
    toast('The agent queued a draft — decide in the Approvals tab.', 'is-agent');
    await narrate(`Draft ${draft.result.approval_id} is in your Approvals tab. I’m waiting for your decision — take your time.`);

    const decision = await pollApproval(draft.result.approval_id);
    if (decision.status === 'rejected') {
      await narrate('Understood — you rejected it. I won’t touch that lead again.');
      return;
    }
    await narrate(
      decision.status === 'edited'
        ? 'You revised the text — I’ll use your version and note the touchpoint.'
        : 'Approved, thank you. Logging the touchpoint and scheduling the next step.',
    );
    await call('log_touchpoint', {
      leadId: lead.id,
      type: 'email',
      summary: `Approved follow-up sent (${decision.status === 'edited' ? 'human-revised text' : 'draft unchanged'}).`,
    });
    const when = new Date();
    when.setDate(when.getDate() + 7);
    await call('schedule_followup', {
      leadId: lead.id,
      date: when.toISOString().slice(0, 10),
      note: 'Check reply, then call once',
    });
    await narrate('Done. One agent, eleven tools, one human approval — nothing happened without you.');
  } catch (error) {
    await narrate(`Something failed on my side: ${error.message}`);
  } finally {
    running = false;
    setBusyBadge(false);
    button.disabled = false;
  }
}

async function call(name, args) {
  const outcome = await runTool(name, args, { actor: 'agent' });
  await wait(350);
  return outcome;
}

async function pollApproval(id, { timeoutMs = 150_000, intervalMs = 4_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await wait(intervalMs);
    const approval = getApproval(id);
    if (approval && approval.status !== 'pending') return approval;
  }
  return { status: 'timeout' };
}

function buildDraft(lead) {
  const first = lead.contact ? `Hello ${lead.contact.split(' ')[0]},` : 'Hello,';
  const topic = (lead.notes[0] || 'our last conversation').replace(/\.$/, '');
  return [
    first,
    '',
    `it’s been a little while since we last spoke about ${topic}.`,
    `I wanted to get back to you before this slips — is the topic still on your table for this quarter?`,
    '',
    'If yes, I can have a concrete proposal ready within the week. If something has changed, a short reply is enough and I’ll close the file.',
    '',
    'Best regards from Stuttgart',
  ].join('\n');
}
