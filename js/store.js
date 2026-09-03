// Central state: leads, activity log, approval queue. Persists to localStorage,
// notifies subscribers after every mutation. Also importable in Node (tests)
// because storage access is guarded.

import { seedLeads } from './seed.js';

const STORAGE_KEY = 'signalwerk.state.v1';
const MAX_ACTIVITY = 120;

const listeners = new Set();

function emptyState() {
  return {
    leads: [],
    activity: [],
    approvals: [],
    seq: 1,
  };
}

function safeStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Storage can throw in privacy modes; running in-memory is fine.
  }
  return null;
}

let state = emptyState();

export function loadState() {
  const storage = safeStorage();
  const raw = storage ? storage.getItem(STORAGE_KEY) : null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.leads)) {
        state = { ...emptyState(), ...parsed };
        return state;
      }
    } catch {
      // Corrupt snapshot — fall through to a fresh seed.
    }
  }
  state = emptyState();
  state.leads = seedLeads();
  state.seq = state.leads.reduce((max, lead) => Math.max(max, lead.numericId), 0) + 1;
  persist();
  return state;
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persist() {
  const storage = safeStorage();
  if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function commit() {
  persist();
  for (const fn of listeners) fn(state);
}

export function resetState() {
  state = emptyState();
  state.leads = seedLeads();
  state.seq = state.leads.reduce((max, lead) => Math.max(max, lead.numericId), 0) + 1;
  commit();
}

// ---------- ids & time ----------

function nextLeadId() {
  const id = `L-${String(state.seq).padStart(3, '0')}`;
  state.seq += 1;
  return id;
}

export function now() {
  return new Date().toISOString();
}

// ---------- ephemeral page context (shared with agents via tool results) ----------

let uiState = { view: 'board', selectedLeadId: null, stageFilter: null };

export function setUiState(patch) {
  uiState = { ...uiState, ...patch };
}

export function getUiState() {
  return uiState;
}

export function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ---------- activity ----------

export function logActivity(entry) {
  const item = {
    id: `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    ts: now(),
    actor: entry.actor || 'system', // 'agent' | 'human' | 'system'
    tool: entry.tool || null,
    summary: entry.summary || '',
    detail: entry.detail || null,
    leadId: entry.leadId || null,
  };
  state.activity.unshift(item);
  if (state.activity.length > MAX_ACTIVITY) state.activity.length = MAX_ACTIVITY;
  return item;
}

// ---------- leads ----------

export const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

export function getLead(id) {
  return state.leads.find((lead) => lead.id === id) || null;
}

export function addLead({ company, contact, email, value, stage = 'new', note, city, source }) {
  const id = nextLeadId();
  const lead = {
    id,
    numericId: Number(id.slice(2)),
    company: String(company).trim(),
    contact: String(contact || '').trim(),
    role: '',
    email: String(email || '').trim(),
    city: String(city || '').trim(),
    source: String(source || 'agent').trim(),
    value: Math.max(0, Math.round(Number(value) || 0)),
    stage: STAGES.includes(stage) ? stage : 'new',
    nextStep: null,
    lastTouch: now(),
    createdAt: now(),
    notes: [],
    timeline: [],
  };
  if (note) {
    lead.notes.push(note);
    lead.timeline.push({ ts: now(), type: 'note', actor: 'system', summary: note });
  }
  lead.timeline.push({
    ts: now(),
    type: 'stage',
    actor: 'system',
    summary: `Created in stage “${lead.stage}”`,
  });
  state.leads.unshift(lead);
  commit();
  return lead;
}

function touchTimeline(lead, type, actor, summary) {
  lead.timeline.push({ ts: now(), type, actor, summary });
  lead.lastTouch = now();
}

export function logTouchpoint(id, { type = 'note', summary, actor = 'human' }) {
  const lead = getLead(id);
  if (!lead) return null;
  touchTimeline(lead, type, actor, String(summary));
  commit();
  return lead;
}

export function moveLead(id, stage, { actor = 'human' } = {}) {
  const lead = getLead(id);
  if (!lead) return null;
  if (!STAGES.includes(stage)) throw new Error(`Unknown stage “${stage}”`);
  if (lead.stage === stage) return lead;
  const from = lead.stage;
  lead.stage = stage;
  lead.timeline.push({ ts: now(), type: 'stage', actor, summary: `Moved ${from} → ${stage}` });
  lead.lastTouch = now();
  commit();
  return lead;
}

export function scheduleFollowup(id, { date, note, actor = 'human' }) {
  const lead = getLead(id);
  if (!lead) return null;
  if (!date) throw new Error('date is required (YYYY-MM-DD)');
  lead.nextStep = { date: String(date), text: String(note || 'Follow-up') };
  lead.timeline.push({ ts: now(), type: 'followup', actor, summary: `Next step ${date}: ${note || 'Follow-up'}` });
  commit();
  return lead;
}

// ---------- approvals (human-in-the-loop gate) ----------

export function queueApproval({ leadId, channel = 'email', message, suggestedDate, requester = 'agent' }) {
  const lead = getLead(leadId);
  if (!lead) throw new Error(`Unknown lead ${leadId}`);
  const approval = {
    id: `AP-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase(),
    ts: now(),
    leadId,
    company: lead.company,
    channel,
    message: String(message),
    suggestedDate: suggestedDate || null,
    requester,
    status: 'pending', // pending | approved | rejected | edited
    humanMessage: null,
    decidedAt: null,
  };
  state.approvals.unshift(approval);
  commit();
  return approval;
}

export function getApproval(id) {
  return state.approvals.find((entry) => entry.id === id) || null;
}

export function decideApproval(id, decision, { message } = {}) {
  const approval = getApproval(id);
  if (!approval) throw new Error(`Unknown approval ${id}`);
  if (!['approved', 'rejected', 'edited'].includes(decision)) {
    throw new Error('decision must be approved, rejected or edited');
  }
  approval.status = decision;
  approval.humanMessage = message ?? null;
  approval.decidedAt = now();
  commit();
  return approval;
}

export function pendingApprovals() {
  return state.approvals.filter((entry) => entry.status === 'pending');
}

// ---------- queries (shared by tools & UI) ----------

export function staleDaysOf(lead) {
  return daysSince(lead.lastTouch);
}

export function searchLeads({ query = '', stage = null, minValue = 0, staleDays = null, limit = 50 } = {}) {
  const needle = String(query).toLowerCase().trim();
  let hits = state.leads.filter((lead) => {
    if (stage && lead.stage !== stage) return false;
    if (minValue && lead.value < minValue) return false;
    if (staleDays && staleDaysOf(lead) < staleDays) return false;
    if (needle) {
      const haystack = `${lead.company} ${lead.contact} ${lead.email} ${lead.city} ${lead.notes.join(' ')}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
  hits = hits.sort((a, b) => b.value - a.value).slice(0, Math.max(1, Math.min(200, limit)));
  return hits;
}

export function pipelineStats() {
  const open = state.leads.filter((lead) => !['won', 'lost'].includes(lead.stage));
  const byStage = {};
  for (const stage of STAGES) byStage[stage] = { count: 0, value: 0 };
  for (const lead of state.leads) {
    byStage[lead.stage].count += 1;
    byStage[lead.stage].value += lead.value;
  }
  const stale = open.filter((lead) => staleDaysOf(lead) >= 14);
  return {
    openDeals: open.length,
    openValue: open.reduce((sum, lead) => sum + lead.value, 0),
    staleCount: stale.length,
    staleValue: stale.reduce((sum, lead) => sum + lead.value, 0),
    wonValue: byStage.won.value,
    pendingApprovals: pendingApprovals().length,
    byStage,
  };
}
