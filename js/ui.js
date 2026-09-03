// All rendering and direct human interaction: board, drawer, stats, agent
// space tabs (activity / approvals / tools), toasts. Re-renders from store
// state on every change — the dataset is small, simplicity wins.

import {
  STAGES,
  getLead,
  getState,
  logActivity,
  logTouchpoint,
  moveLead,
  pipelineStats,
  scheduleFollowup,
  setUiState,
  subscribe,
} from './store.js';
import { humanDecide, TOOLS } from './tools.js';
import { webmcp } from './webmcp.js';

const STAGE_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
};

const euro = (value) => `€${value.toLocaleString('en-US')}`;
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

let openLeadId = null;
let editingApprovalId = null;

export function initUi() {
  wireTabs();
  wireDrawerChrome();
  subscribe(() => render());

  document.getElementById('btn-reset').addEventListener('click', () => {
    // Import lazily to avoid a cycle at module load.
    import('./store.js').then(({ resetState }) => {
      resetState();
      openLeadId = null;
      toast('Demo data reset.');
    });
  });

  render();
}

/* ---------- stats ---------- */

function renderStats(stats) {
  const el = document.getElementById('stats');
  el.innerHTML = '';
  el.append(
    statChip(euro(stats.openValue), 'pipeline'),
    statChip(String(stats.openDeals), 'open deals'),
    statChip(String(stats.staleCount), 'stale ≥14d', stats.staleCount > 0 ? 'is-warn' : ''),
    statChip(String(stats.pendingApprovals), 'awaiting you', stats.pendingApprovals > 0 ? 'is-agent' : ''),
  );
}

function statChip(value, label, extra = '') {
  const div = document.createElement('div');
  div.className = `stat ${extra}`.trim();
  const b = document.createElement('b');
  b.textContent = value;
  const span = document.createElement('span');
  span.textContent = label;
  div.append(b, span);
  return div;
}

/* ---------- board ---------- */

function renderBoard(leads) {
  const board = document.getElementById('board');
  board.innerHTML = '';

  for (const stage of STAGES) {
    const columnLeads = leads.filter((lead) => lead.stage === stage);
    const column = document.createElement('div');
    column.className = `column is-${stage}`;
    column.dataset.stage = stage;

    const head = document.createElement('div');
    head.className = 'column-head';
    head.innerHTML = `<span class="column-title">${STAGE_LABELS[stage]}</span>`;
    const sum = document.createElement('span');
    sum.className = 'column-sum';
    sum.textContent = columnLeads.length
      ? `${columnLeads.length} · ${euro(columnLeads.reduce((acc, lead) => acc + lead.value, 0))}`
      : 'empty';
    head.append(sum);
    column.append(head);

    const cards = document.createElement('div');
    cards.className = 'column-cards';
    for (const lead of columnLeads) cards.append(leadCard(lead));
    column.append(cards);

    column.addEventListener('dragover', (event) => {
      event.preventDefault();
      column.classList.add('is-over');
    });
    column.addEventListener('dragleave', () => column.classList.remove('is-over'));
    column.addEventListener('drop', (event) => {
      event.preventDefault();
      column.classList.remove('is-over');
      const id = event.dataTransfer.getData('text/plain');
      const lead = getLead(id);
      if (lead && lead.stage !== stage) {
        moveLead(id, stage, { actor: 'human' });
        logActivity({ actor: 'human', summary: `moved ${lead.company} to ${STAGE_LABELS[stage]}`, leadId: id });
      }
    });

    board.append(column);
  }
}

function leadCard(lead) {
  const card = document.createElement('article');
  card.className = 'card';
  card.draggable = true;
  card.dataset.leadId = lead.id;

  const stale = staleDot(lead);
  card.innerHTML = `
    <div class="card-top">
      <span class="card-company">${escapeHtml(lead.company)}</span>
      <span class="card-value">${euro(lead.value)}</span>
    </div>
    <div class="card-contact">${escapeHtml(lead.contact || lead.city || '—')}</div>
    <div class="card-meta">
      ${stale.outerHTML}
      <span class="card-next">${lead.nextStep ? escapeHtml(`${lead.nextStep.date} · ${lead.nextStep.text}`) : 'no next step'}</span>
      ${lead.source === 'agent' ? '<span class="card-flag" title="Created by an agent via WebMCP">agent</span>' : ''}
    </div>
  `;

  card.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', lead.id);
    card.classList.add('is-dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
  card.addEventListener('click', () => openDrawer(lead.id));
  return card;
}

function staleDot(lead) {
  const days = Math.floor((Date.now() - new Date(lead.lastTouch).getTime()) / 86_400_000);
  const cls = days < 7 ? 's-fresh' : days < 14 ? 's-warm' : 's-stale';
  return Object.assign(document.createElement('span'), {
    className: `stale-dot ${cls}`,
    title: `Last touch ${days} day${days === 1 ? '' : 's'} ago`,
  });
}

/* ---------- drawer ---------- */

function openDrawer(leadId) {
  openLeadId = leadId;
  setUiState({ selectedLeadId: leadId });
  renderDrawer();
  document.getElementById('drawer').hidden = false;
  document.getElementById('drawer-backdrop').hidden = false;
}

function closeDrawer() {
  openLeadId = null;
  setUiState({ selectedLeadId: null });
  document.getElementById('drawer').hidden = true;
  document.getElementById('drawer-backdrop').hidden = true;
}

function wireDrawerChrome() {
  document.getElementById('drawer-backdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.getElementById('drawer').hidden) closeDrawer();
  });
}

function renderDrawer() {
  if (!openLeadId) return;
  const lead = getLead(openLeadId);
  if (!lead) return closeDrawer();
  const drawer = document.getElementById('drawer');

  drawer.innerHTML = `
    <button class="btn btn-ghost btn-icon drawer-close" type="button" aria-label="Close">✕</button>
    <div class="kicker">${lead.id} · ${STAGE_LABELS[lead.stage]}</div>
    <h3>${escapeHtml(lead.company)}</h3>
    <dl class="kv">
      <dt>Contact</dt><dd>${escapeHtml(lead.contact || '—')}${lead.role ? ` · ${escapeHtml(lead.role)}` : ''}</dd>
      <dt>Email</dt><dd>${lead.email ? escapeHtml(lead.email) : '—'}</dd>
      <dt>City</dt><dd>${escapeHtml(lead.city || '—')}</dd>
      <dt>Value</dt><dd><strong>${euro(lead.value)}</strong> / year</dd>
      <dt>Last touch</dt><dd>${new Date(lead.lastTouch).toLocaleDateString()} (${Math.floor((Date.now() - new Date(lead.lastTouch).getTime()) / 86_400_000)} days ago)</dd>
      <dt>Next step</dt><dd>${lead.nextStep ? `${escapeHtml(lead.nextStep.date)} — ${escapeHtml(lead.nextStep.text)}` : '—'}</dd>
    </dl>
    <div class="drawer-actions">
      <select id="drawer-move" class="btn" title="Move stage">
        ${STAGES.map((stage) => `<option value="${stage}" ${stage === lead.stage ? 'selected' : ''}>${STAGE_LABELS[stage]}</option>`).join('')}
      </select>
      <input id="drawer-date" class="btn" type="date" value="${lead.nextStep ? lead.nextStep.date : ''}" title="Next step date" />
      <input id="drawer-step" class="btn" type="text" placeholder="Next step…" value="${lead.nextStep ? escapeHtml(lead.nextStep.text) : ''}" />
      <button id="drawer-schedule" class="btn" type="button">Save step</button>
    </div>
    <div class="drawer-actions">
      <select id="drawer-type" class="btn">
        <option value="call">Call</option><option value="email">Email</option>
        <option value="meeting">Meeting</option><option value="note">Note</option>
      </select>
      <input id="drawer-summary" class="btn" type="text" placeholder="What happened?" style="flex:1" />
      <button id="drawer-log" class="btn btn-primary" type="button">Log</button>
    </div>
    <h3 style="margin-top:20px">Timeline</h3>
    <ul class="timeline">
      ${lead.timeline.slice().reverse().map((entry) => `
        <li class="${entry.actor === 'agent' ? 'actor-agent' : ''}">
          <div class="t-head">
            <span class="t-type">${entry.type}</span>
            <span class="t-time">${clock(entry.ts)}</span>
          </div>
          ${escapeHtml(entry.summary)}
        </li>`).join('')}
    </ul>
  `;

  drawer.querySelector('.drawer-close').addEventListener('click', closeDrawer);
  drawer.querySelector('#drawer-log').addEventListener('click', () => {
    const summary = drawer.querySelector('#drawer-summary').value.trim();
    if (!summary) return toast('Add a short summary first.');
    const type = drawer.querySelector('#drawer-type').value;
    logTouchpoint(lead.id, { type, summary, actor: 'human' });
    logActivity({ actor: 'human', summary: `${type}: ${summary}`, leadId: lead.id });
    drawer.querySelector('#drawer-summary').value = '';
  });
  drawer.querySelector('#drawer-schedule').addEventListener('click', () => {
    const date = drawer.querySelector('#drawer-date').value;
    const text = drawer.querySelector('#drawer-step').value.trim() || 'Follow-up';
    if (!date) return toast('Pick a date first.');
    scheduleFollowup(lead.id, { date, note: text, actor: 'human' });
    logActivity({ actor: 'human', summary: `scheduled ${date}: ${text}`, leadId: lead.id });
  });
  drawer.querySelector('#drawer-move').addEventListener('change', (event) => {
    const stage = event.target.value;
    if (stage !== lead.stage) {
      moveLead(lead.id, stage, { actor: 'human' });
      logActivity({ actor: 'human', summary: `moved ${lead.company} to ${STAGE_LABELS[stage]}`, leadId: lead.id });
    }
  });
}

/* ---------- agent space ---------- */

function wireTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((entry) => entry.classList.toggle('is-active', entry === tab));
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('is-active', panel.id === `tab-${tab.dataset.tab}`);
      });
    });
  });
}

function focusTab(name) {
  document.querySelector(`.tab[data-tab="${name}"]`)?.click();
}

function renderFeed() {
  const feed = document.getElementById('feed');
  feed.innerHTML = '';
  const entries = getState().activity.slice(0, 40);
  if (!entries.length) {
    feed.innerHTML = '<li class="feed-note muted small">Nothing yet — run the demo agent or call a tool.</li>';
    return;
  }
  for (const item of entries) {
    const li = document.createElement('li');
    li.className = 'feed-item';
    li.innerHTML = `
      <span class="feed-dot actor-${item.actor}"></span>
      <div>
        <div class="feed-head">
          ${item.tool ? `<span class="feed-tool">${item.tool}</span>` : ''}
          <span class="feed-actor">${item.actor}</span>
          <span class="feed-time">${clock(item.ts)}</span>
        </div>
        <div class="feed-summary">${escapeHtml(item.summary)}</div>
        ${item.detail ? `<div class="feed-detail">${escapeHtml(item.detail)}</div>` : ''}
      </div>
    `;
    feed.append(li);
  }
}

function renderApprovals() {
  const wrap = document.getElementById('approvals');
  wrap.innerHTML = '';
  const approvals = getState().approvals.slice(0, 8);
  if (!approvals.length) {
    wrap.innerHTML = '<p class="muted small pad">No drafts yet. When an agent queues one, it shows up here for your decision.</p>';
    return;
  }

  const pill = document.getElementById('approval-count');
  const pending = approvals.filter((entry) => entry.status === 'pending').length;
  pill.hidden = pending === 0;
  pill.textContent = String(pending);

  for (const approval of approvals) {
    const card = document.createElement('div');
    card.className = `approval ${approval.status === 'pending' ? '' : 'is-decided'}`;
    const decided = approval.status !== 'pending';
    card.innerHTML = `
      <div class="approval-head">
        <span class="tag">${approval.channel} draft</span>
        ${decided ? `<span class="verdict v-${approval.status}">${verdictLabel(approval.status)}</span>` : ''}
        ${approval.suggestedDate ? `<span class="approval-meta">${approval.suggestedDate}</span>` : ''}
      </div>
      <div class="approval-lead">${escapeHtml(approval.company)} <span class="muted small">· ${approval.leadId} · by ${approval.requester}</span></div>
      <div class="approval-msg" id="msg-${approval.id}">${escapeHtml(approval.humanMessage || approval.message)}</div>
      <div class="approval-meta">Queued ${clock(approval.ts || new Date().toISOString())} · id ${approval.id}</div>
    `;

    if (!decided) {
      const actions = document.createElement('div');
      actions.className = 'approval-actions';
      actions.innerHTML = `
        <button class="btn btn-go" data-decide="approved" type="button">Approve</button>
        <button class="btn" data-decide="edited" type="button">Edit &amp; approve</button>
        <button class="btn btn-danger" data-decide="rejected" type="button">Reject</button>
      `;
      actions.addEventListener('click', (event) => {
        const button = event.target.closest('[data-decide]');
        if (!button) return;
        decide(approval.id, button.dataset.decide);
      });
      card.append(actions);
    } else if (approval.status === 'edited') {
      const note = document.createElement('div');
      note.className = 'approval-meta';
      note.textContent = 'Human revised the text above before approving — the agent will see human_message.';
      card.append(note);
    }
    wrap.append(card);
  }
}

function verdictLabel(status) {
  return { approved: 'approved ✓', edited: 'edited & approved', rejected: 'rejected ✕' }[status];
}

function decide(id, decision) {
  let message = null;
  if (decision === 'edited' || decision === 'approved') {
    if (editingApprovalId === id && decision === 'edited') {
      const textarea = document.querySelector(`#msg-${id}`);
      message = textarea && textarea.tagName === 'TEXTAREA' ? textarea.value : null;
    } else if (decision === 'edited') {
      // Swap the message body for an editable textarea once.
      const body = document.querySelector(`#msg-${id}`);
      const approval = getState().approvals.find((entry) => entry.id === id);
      body.outerHTML = `<textarea class="approval-msg" id="msg-${id}">${escapeHtml(approval.message)}</textarea>`;
      editingApprovalId = id;
      toast('Revise the text, then press “Edit & approve” again.');
      return;
    }
  }
  editingApprovalId = null;
  humanDecide(id, decision, { message });
  toast(decision === 'rejected' ? 'Draft rejected — the agent will see it.' : 'Approved. The agent can pick it up.', 'is-agent');
}

/* ---------- tools tab ---------- */

function renderTools() {
  const wrap = document.getElementById('tool-list');
  wrap.innerHTML = '';
  for (const tool of TOOLS) {
    const item = document.createElement('div');
    item.className = 'tool-item';
    const read = tool.annotations?.readOnlyHint === true;
    const isGate = tool.name === 'draft_followup';
    item.innerHTML = `
      <div class="tool-name">${tool.name}</div>
      <div class="tool-desc">${escapeHtml(tool.description)}</div>
      <div class="tool-tags">
        <span class="tool-tag ${read ? 'read' : 'write'}">${read ? 'read-only' : 'writes'}</span>
        ${isGate ? '<span class="tool-tag approval">human approval gate</span>' : ''}
        ${Object.keys(tool.inputSchema.properties || {}).map((key) => `<span class="tool-tag">${key}</span>`).join('')}
      </div>
    `;
    wrap.append(item);
  }
}

/* ---------- badge & toast ---------- */

export function renderBadge() {
  const badge = document.getElementById('webmcp-badge');
  badge.classList.remove('is-live', 'is-fallback', 'is-busy');
  if (webmcp.supported) {
    badge.classList.add('is-live');
    badge.textContent = `WebMCP live · ${webmcp.registered.length} tools`;
    badge.title = 'This page is registered with the browser. ChatGPT site tools / Chrome WebMCP agents can call these tools now.';
  } else {
    badge.classList.add('is-fallback');
    badge.textContent = 'WebMCP not detected · local mode';
    badge.title = 'No WebMCP implementation in this browser. Tools still work locally via the playground and the demo agent. Open this URL in ChatGPT\'s in-app browser or Chrome with chrome://flags/#enable-webmcp-testing to hand the tools to a real agent.';
  }
}

export function setBusyBadge(isBusy) {
  const badge = document.getElementById('webmcp-badge');
  badge.classList.toggle('is-busy', isBusy);
}

let toastTimer = null;
export function toast(message, extra = '') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast ${extra}`.trim();
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2800);
}

/* ---------- master render ---------- */

let lastPulsedEntry = null;

function render() {
  const state = getState();
  renderStats(pipelineStats());
  renderBoard(state.leads);
  renderFeed();
  renderApprovals();
  renderTools();
  if (openLeadId) renderDrawer();

  // Pulse the card an agent just touched — the human sees where the agent acted.
  const latest = state.activity[0];
  if (latest && latest.actor === 'agent' && latest.leadId && latest.id !== lastPulsedEntry) {
    lastPulsedEntry = latest.id;
    const card = document.querySelector(`[data-lead-id="${latest.leadId}"]`);
    if (card) {
      card.classList.add('is-pulsing');
      setTimeout(() => card.classList.remove('is-pulsing'), 2400);
    }
  }
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

export { focusTab };
