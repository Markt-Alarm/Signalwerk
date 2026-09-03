# Architecture notes

## One store, three callers

Everything mutates through `js/store.js` (single source of truth, persisted to
`localStorage`). Tool executions all funnel through `runTool(name, args, {actor})`
in `js/tools.js`:

```
ChatGPT in-app browser ─┐
Chrome WebMCP agent ────┤→ document.modelContext → runRegistered ─┐
Tool Playground ────────┤→ runTool(name, args, actor:'human') ────┼→ tool.execute → store
Demo agent ─────────────┘                                          ┘
```

That gives one activity log, one error path, one result-summary vocabulary for
every caller — which is what makes the feed trustworthy.

## The approval gate

`draft_followup` is the only "consequential" tool. It never mutates a lead.
It writes an approval record (`pending`) and returns its id; the agent is told
to poll `get_approval`. Humans decide in the Approvals tab:

- **Approve** → status `approved`, message unchanged
- **Edit & approve** (two-step) → status `edited`, `human_message` = the human's text
- **Reject** → status `rejected`

`get_approval` returns the status plus a `guidance` string, because the model
on the other side should not have to guess what `edited` implies.

## Registration lifecycle

`js/webmcp.js` detects `document.modelContext.registerTool` first (current
spec shape), falls back to `navigator.modelContext`. Each tool gets its own
`AbortController` signal — the SPA-friendly way to unregister. Registration
failures are logged into the activity feed instead of dying silently, and the
header badge reports the true state ("WebMCP live · 11 tools" vs. "local mode").

## Shared context

`store.setUiState()` tracks what the human is looking at (current view,
selected lead). Read tools embed it in their results as `ui_state`, so an
agent can phrase answers relative to the human's screen ("the lead you have
open…"). It is deliberately ephemeral — never persisted, never stale.

## Degradation, not dead ends

Without a WebMCP host the page is still a complete product: the playground
builds schema-driven forms from the very `inputSchema` objects the agents get,
and the demo agent replays the full loop (overview → stale → draft → poll →
apply verdict) through the same `runTool` path. The demo agent is clearly
labeled in the feed — no fake "real agent" theater.

## Why no framework

The page is six small modules with a clear seam (store / tools / UI). A
framework would have added a build step, a bigger audit surface, and nothing
else. The interesting engineering here is the tool protocol layer, and it is
~200 lines of dependency-free code.
