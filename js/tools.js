// The eleven tools this page publishes to WebMCP agents.
//
// Design rules (mirroring the OpenAI WebMCP guidance):
//   - narrow inputs, JSON Schema with enums where possible
//   - results carry enough detail (ids, computed fields) for the agent to verify
//   - reads are marked readOnlyHint; the one consequential tool (draft_followup)
//     never mutates the pipeline — it queues for human approval instead.

import {
  STAGES,
  addLead,
  decideApproval,
  getApproval,
  getLead,
  getState,
  getUiState,
  logActivity,
  logTouchpoint,
  moveLead,
  pipelineStats,
  queueApproval,
  scheduleFollowup,
  searchLeads,
  staleDaysOf,
} from './store.js';

const READ = { readOnlyHint: true };

function compactLead(lead) {
  return {
    id: lead.id,
    company: lead.company,
    contact: lead.contact || null,
    email: lead.email || null,
    city: lead.city || null,
    value_eur: lead.value,
    stage: lead.stage,
    days_since_last_touch: staleDaysOf(lead),
    next_step: lead.nextStep,
  };
}

function fullLead(lead) {
  return {
    ...compactLead(lead),
    source: lead.source,
    created_at: lead.createdAt,
    notes: lead.notes,
    timeline: lead.timeline.slice(-20).map((entry) => ({
      ts: entry.ts,
      type: entry.type,
      actor: entry.actor,
      summary: entry.summary,
    })),
  };
}

function requireLead(leadId) {
  const lead = getLead(leadId);
  if (!lead) throw new Error(`No lead with id ${leadId}. Call search_leads to list valid ids.`);
  return lead;
}

export const TOOLS = [
  {
    name: 'get_pipeline_overview',
    description:
      'Read the current sales pipeline: open deal count and value in EUR, per-stage breakdown, ' +
      'stale deals (no touch in 14+ days), pending human approvals, and what the human is currently viewing.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ,
    execute() {
      const stats = pipelineStats();
      const stale = searchLeads({ staleDays: 14, limit: 3 }).map(compactLead);
      return {
        ...stats,
        most_valuable_stale_leads: stale,
        ui_state: getUiState(),
        hint: 'Use search_leads for specific leads, find_stale_leads for the full stale list.',
      };
    },
  },

  {
    name: 'search_leads',
    description:
      'Search leads by free-text query (company, contact, email, city, notes) with optional filters: ' +
      'stage, minimum value in EUR, and days since last touch. Returns leads sorted by value, highest first.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free text, e.g. company or contact name. Empty = all.' },
        stage: { type: 'string', enum: STAGES, description: 'Restrict to one pipeline stage.' },
        minValue: { type: 'number', description: 'Only leads worth at least this many EUR.' },
        staleDays: { type: 'number', description: 'Only leads not touched for at least this many days.' },
        limit: { type: 'number', description: 'Max results (default 25).' },
      },
      additionalProperties: false,
    },
    annotations: READ,
    execute({ query = '', stage = null, minValue = 0, staleDays = null, limit = 25 } = {}) {
      const hits = searchLeads({ query, stage, minValue, staleDays, limit });
      return {
        count: hits.length,
        total_pipeline: pipelineStats().openValue,
        leads: hits.map(compactLead),
      };
    },
  },

  {
    name: 'get_lead',
    description: 'Read one lead in full: contact details, value, stage, notes, next step and the recent activity timeline.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'Lead id, e.g. "L-004". Find ids via search_leads.' },
      },
      required: ['leadId'],
      additionalProperties: false,
    },
    annotations: READ,
    execute({ leadId }) {
      return fullLead(requireLead(leadId));
    },
  },

  {
    name: 'find_stale_leads',
    description:
      'List open deals with no interaction for N days (default 14), sorted by deal value so the ' +
      'most valuable neglected relationships come first.',
    inputSchema: {
      type: 'object',
      properties: {
        staleDays: { type: 'number', description: 'Threshold in days (default 14).' },
        limit: { type: 'number', description: 'Max results (default 10).' },
      },
      additionalProperties: false,
    },
    annotations: READ,
    execute({ staleDays = 14, limit = 10 } = {}) {
      const hits = searchLeads({ staleDays, limit });
      return {
        threshold_days: staleDays,
        count: hits.length,
        leads: hits.map(compactLead),
      };
    },
  },

  {
    name: 'get_recent_activity',
    description:
      'Read the live activity log: which human or agent did what on this page recently, including your own tool calls.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max entries (default 15).' },
      },
      additionalProperties: false,
    },
    annotations: READ,
    execute({ limit = 15 } = {}) {
      const entries = getState().activity.slice(0, Math.max(1, Math.min(50, limit)));
      return {
        count: entries.length,
        entries: entries.map((item) => ({
          ts: item.ts,
          actor: item.actor,
          tool: item.tool,
          summary: item.summary,
          lead_id: item.leadId,
        })),
      };
    },
  },

  {
    name: 'get_approval',
    description:
      'Check the human decision on a queued outreach draft. Returns status "pending", "approved", "edited" ' +
      '(approved with the human\'s revised text in human_message) or "rejected". If pending, tell the user ' +
      'you are waiting and call again later — never retry the draft.',
    inputSchema: {
      type: 'object',
      properties: {
        approvalId: { type: 'string', description: 'Id returned by draft_followup, e.g. "AP-ABC123".' },
      },
      required: ['approvalId'],
      additionalProperties: false,
    },
    annotations: READ,
    execute({ approvalId }) {
      const approval = getApproval(approvalId);
      if (!approval) throw new Error(`No approval with id ${approvalId}.`);
      return {
        approval_id: approval.id,
        lead_id: approval.leadId,
        company: approval.company,
        status: approval.status,
        human_message: approval.humanMessage,
        decided_at: approval.decidedAt,
        guidance:
          approval.status === 'pending'
            ? 'Still waiting for the human. Mention that the draft sits in their Approvals tab.'
            : approval.status === 'edited'
              ? 'The human approved a revised version. Use human_message as the final text.'
              : `The human ${approval.status} the draft.`,
      };
    },
  },

  {
    name: 'add_lead',
    description: 'Create a new lead in the pipeline. Use it when the user mentions a new prospect worth tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name (required).' },
        contact: { type: 'string', description: 'Person to talk to.' },
        email: { type: 'string', description: 'Contact email if known.' },
        city: { type: 'string', description: 'City or district.' },
        value: { type: 'number', description: 'Estimated deal value in EUR per year.' },
        stage: { type: 'string', enum: STAGES, description: 'Defaults to "new".' },
        note: { type: 'string', description: 'Why this lead matters — one or two sentences.' },
      },
      required: ['company'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    execute(args) {
      if (!args.company || !String(args.company).trim()) throw new Error('company is required.');
      const lead = addLead(args);
      return {
        created: true,
        lead: compactLead(lead),
      };
    },
  },

  {
    name: 'log_touchpoint',
    description:
      'Record an interaction with a lead (call, email, meeting or note) in its timeline. Resets the staleness clock.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'Lead id, e.g. "L-002".' },
        type: { type: 'string', enum: ['call', 'email', 'meeting', 'note'] },
        summary: { type: 'string', description: 'What happened, one sentence.' },
      },
      required: ['leadId', 'type', 'summary'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    execute({ leadId, type = 'note', summary }) {
      requireLead(leadId);
      if (!summary || !String(summary).trim()) throw new Error('summary is required.');
      const lead = logTouchpoint(leadId, { type, summary, actor: 'agent' });
      return { logged: true, lead: compactLead(lead) };
    },
  },

  {
    name: 'move_lead',
    description: 'Move a lead to another pipeline stage (new, contacted, qualified, proposal, won, lost).',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'Lead id, e.g. "L-002".' },
        stage: { type: 'string', enum: STAGES },
      },
      required: ['leadId', 'stage'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    execute({ leadId, stage }) {
      requireLead(leadId);
      const lead = moveLead(leadId, stage, { actor: 'agent' });
      return { moved: true, lead: compactLead(lead) };
    },
  },

  {
    name: 'schedule_followup',
    description: 'Set or change the next step and its due date for a lead.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'Lead id, e.g. "L-002".' },
        date: { type: 'string', description: 'Due date, format YYYY-MM-DD.' },
        note: { type: 'string', description: 'What the next step is about.' },
      },
      required: ['leadId', 'date'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    execute({ leadId, date, note }) {
      requireLead(leadId);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
        throw new Error('date must be YYYY-MM-DD.');
      }
      const lead = scheduleFollowup(leadId, { date, note, actor: 'agent' });
      return { scheduled: true, lead: compactLead(lead) };
    },
  },

  {
    name: 'draft_followup',
    description:
      'Queue an outreach draft (email, call script or letter) for a lead. THIS TOOL DOES NOT SEND ANYTHING: ' +
      'the draft appears in the human\'s Approvals tab and stays there until they approve, edit or reject it. ' +
      'Returns an approval_id — poll get_approval for the decision. Write the message text yourself, in the ' +
      'lead\'s language, personal and under 120 words.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'Lead id, e.g. "L-003".' },
        channel: { type: 'string', enum: ['email', 'phone', 'letter'], description: 'Defaults to email.' },
        message: { type: 'string', description: 'The full draft text, ready to send after approval.' },
        suggestedDate: { type: 'string', description: 'When to reach out, YYYY-MM-DD (optional).' },
      },
      required: ['leadId', 'message'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    execute({ leadId, channel = 'email', message, suggestedDate = null }) {
      const lead = requireLead(leadId);
      if (!message || String(message).trim().length < 20) {
        throw new Error('message must be a real draft (at least ~20 characters).');
      }
      const approval = queueApproval({ leadId, channel, message, suggestedDate, requester: 'agent' });
      return {
        queued: true,
        approval_id: approval.id,
        status: approval.status,
        company: lead.company,
        note: 'Nothing has been sent. The human decides in the Approvals tab. Poll get_approval.',
      };
    },
  },
];

export const TOOL_MAP = new Map(TOOLS.map((tool) => [tool.name, tool]));

// ---------- execution wrapper (shared by WebMCP, playground and demo agent) ----------

let caller = 'agent';

export function runAs(actor) {
  caller = actor;
}

function summarizeArgs(name, args = {}) {
  if (name === 'draft_followup') return `draft for ${args.leadId} (${args.channel || 'email'}, ${String(args.message).length} chars)`;
  if (name === 'search_leads') return `q="${args.query || ''}" stage=${args.stage || 'any'}${args.staleDays ? ` stale≥${args.staleDays}d` : ''}`;
  if (name === 'add_lead') return `new lead "${args.company}"`;
  return Object.entries(args).map(([key, value]) => `${key}=${String(value).slice(0, 40)}`).join(', ') || '—';
}

export async function runTool(name, args, { actor = caller } = {}) {
  const tool = TOOL_MAP.get(name);
  if (!tool) throw new Error(`Unknown tool ${name}`);
  let entry;
  try {
    const result = await tool.execute(args);
    entry = logActivity({
      actor,
      tool: name,
      leadId: args && args.leadId ? args.leadId : null,
      summary: resultSummary(name, result),
      detail: summarizeArgs(name, args),
    });
    return { ok: true, result, entryId: entry.id };
  } catch (error) {
    entry = logActivity({
      actor,
      tool: name,
      summary: `failed: ${error.message}`,
      detail: summarizeArgs(name, args),
    });
    return { ok: false, error: error.message, entryId: entry.id };
  }
}

function resultSummary(name, result) {
  if (!result || typeof result !== 'object') return String(result);
  if (name === 'get_pipeline_overview') {
    return `open=${result.openDeals} worth €${result.openValue.toLocaleString('en-US')}, stale=${result.staleCount}`;
  }
  if (name === 'search_leads' || name === 'find_stale_leads') return `${result.count} hit${result.count === 1 ? '' : 's'}`;
  if (name === 'get_lead') return `${result.company} (${result.stage}, €${result.value_eur.toLocaleString('en-US')})`;
  if (name === 'get_recent_activity') return `${result.count} entries`;
  if (name === 'get_approval') return `${result.approval_id} → ${result.status}`;
  if (name === 'add_lead') return `created ${result.lead.id} “${result.lead.company}”`;
  if (name === 'log_touchpoint') return `logged ${result.lead.id}`;
  if (name === 'move_lead') return `${result.lead.id} → ${result.lead.stage}`;
  if (name === 'schedule_followup') return `${result.lead.id} next: ${result.lead.next_step.date}`;
  if (name === 'draft_followup') return `queued ${result.approval_id} for ${result.company} — awaiting human`;
  return 'done';
}

export function humanDecide(id, decision, opts) {
  const approval = decideApproval(id, decision, opts);
  logActivity({
    actor: 'human',
    summary: decision === 'rejected' ? `rejected draft ${id}` : decision === 'edited' ? `edited & approved draft ${id}` : `approved draft ${id}`,
    detail: decision === 'rejected' ? null : approval.humanMessage ? 'text revised by human' : 'text unchanged',
    leadId: approval.leadId,
  });
  return approval;
}
