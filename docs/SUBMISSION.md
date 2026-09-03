# Devpost submission text (paste-ready)

## Elevator pitch (190 chars)

> Signalwerk turns your sales pipeline into an MCP server: 11 first-party WebMCP tools let any agent work your deals with you — drafts pass a human approval gate. The agent drafts, you decide.

## About the project

### Inspiration

I run Signalwerk, a small B2B lead-research service for German SMBs, and the one rule my clients care about most is printed on every delivery: *kein automatischer Versand, keine Black Box* — no automated sending, no black box. Customers get drafts, they decide.

When WebMCP appeared, I realized the browser page itself could carry that principle into the agentic web. Today an agent reaches a CRM two ways: by scraping the UI (fragile, slow) or through a backend MCP server that duplicates auth, state and hosting (out of reach for a small vendor). WebMCP removes the dilemma: **the page becomes the MCP server.** I wanted to show what that looks like when human control is not a settings toggle but part of the protocol.

### What it does

A lightweight pipeline board (six stages, drag & drop, lead drawer) that registers eleven tools with `document.modelContext.registerTool()`: six reads (`get_pipeline_overview`, `search_leads`, `get_lead`, `find_stale_leads`, `get_recent_activity`, `get_approval`) and five writes (`add_lead`, `log_touchpoint`, `move_lead`, `schedule_followup`, `draft_followup`).

The interesting one is `draft_followup`: it *cannot* touch the pipeline. An agent-written outreach draft lands in the human's Approvals tab; the human approves, edits, or rejects; the agent polls `get_approval` and receives the verdict — including `human_message` when the human rewrote it. Every tool call from either side lands in one visible activity feed, and the board pulses where the agent acted.

### How we built it

Vanilla ES modules, zero dependencies, zero build step — six small files with one seam: `store.js` (state + `localStorage`) → `tools.js` (schemas + executes) → `webmcp.js` (registration). A single runner, `runTool`, wraps every execution so a real WebMCP agent, the built-in **Tool Playground**, and a scripted **demo agent** all go through the identical code path, activity log and error handling. Tool inputs are narrow JSON Schemas with enums; results carry the ids needed to verify the effect. Staleness is computed per lead (days since last touch), and the value at risk is

$$V_{\text{stale}} = \sum_{i:\,\Delta t_i \,\geq\, 14\,\text{d}} v_i,$$

the sum of open deal values whose last touch is 14+ days old — the number the agent and the header badge both work from. Sixteen `node:test` unit tests cover every tool, including the "draft never mutates the lead" guarantee. Deployed as plain static files (GitHub Pages).

### Challenges we ran into

- **Making trust structural.** A `readOnlyHint` is only a hint — the ChatGPT docs say so plainly. So the one consequential operation had to be side-effect-free by construction, with the approval queue as a first-class record (`pending → approved | edited | rejected`) both parties can read.
- **Async for a human-paced world.** The agent must wait for a human who scrolls away for ten minutes. Blocking tools would be terrible UX; instead `draft_followup` returns an id immediately and `get_approval` is designed as state, with `guidance` strings so the model knows what "edited" implies.
- **Building against a standard I can't always run.** WebMCP hosts are gated (specific ChatGPT models, Chrome 149+ with a flag). I mirrored the spec'd API surface (`document.modelContext` first, `navigator.modelContext` as legacy shape, per-tool `AbortController`) and made degradation a feature: without a host, the same tools remain fully usable through the playground and the clearly-labeled demo agent.
- **Resisting frameworks.** A build step would have added nothing but audit surface; keeping the whole protocol layer at ~200 dependency-free lines was the harder and better choice.

### What we learned

- The registration call is the easy 10%. The real craft is **tool design**: narrow inputs, enums over free text, and results written so the model can verify what happened without re-asking.
- Human-in-the-loop works best as a **data model**, not a UI garnish — the approval record made the agent's behavior simpler, not more complex.
- Shared context is a two-way street: embedding `ui_state` in read results lets the agent speak about *the screen the human is looking at*.
- Degrade gracefully and let judges press every button themselves — the playground doubled as our test harness all week.

### Accomplishments we're proud of

Eleven tools, one approval gate, zero dependencies — and a demo where the most valuable neglected deal gets rescued by an agent that asks permission, accepts an edit, and says so out loud in the activity log.

## Project title
Signalwerk — the agent-ready sales pipeline

## Why does your use case fit WebMCP? (required)
Sales people live in two worlds: their pipeline app and their AI assistant. Today those connect only through brittle UI scraping or bespoke backend MCP servers that duplicate auth and state. WebMCP removes that entire layer: the page itself becomes the MCP server.

Signalwerk registers eleven real tools over `document.modelContext.registerTool()` — reads (`get_pipeline_overview`, `search_leads`, `get_lead`, `find_stale_leads`, `get_recent_activity`, `get_approval`) and writes (`add_lead`, `log_touchpoint`, `move_lead`, `schedule_followup`). The agent works the same store the human works, with the app's own validation. No API keys, no integration, no middleware: the website *is* the tool provider, which is exactly the future WebMCP points at.

The one consequential capability — writing outreach — is where WebMCP's human-in-the-loop goals become architecture: `draft_followup` cannot mutate the pipeline. It queues the draft in the human's Approvals tab; the agent polls `get_approval` for the verdict (approved / edited with `human_message` / rejected). Trust is enforced by the tool's shape, not by the model's good behavior.

## What can people + agents do together that was hard or impossible before? (required)
1. **Bring your own agent, zero integration.** Any WebMCP-capable assistant can operate the CRM with first-party semantics. Previously that meant either screen scraping (unreliable) or building a backend MCP server + OAuth (out of reach for a small vendor).
2. **Delegation with a veto.** The human asks "which deals went stale? draft follow-ups for the valuable ones" — the agent investigates (`find_stale_leads` → `get_lead` → `draft_followup`), and the human approves, edits or rejects each message. The agent sees the edited text and logs exactly what was actually sent.
3. **Shared situational awareness.** Tool results carry `ui_state`, both human and agent actions land in one activity feed, and the board pulses where the agent touched. Neither side acts "behind the back" of the other — historically the core complaint about both CRMs (silent automation) and agents (opaque actions).

## How does it improve the UX? (required)
Instead of the agent clicking through forms (slow, fragile) or the human filling them (tedious), the page exposes intent-level operations: "queue a draft", "log this call", "move to qualified". The human keeps a drag-and-drop board and a drawer for direct manipulation; the agent gets narrow, schema'd inputs with enums. Both see the same board, the same feed, the same approval cards. The Tool Playground even lets a human call every tool with the same schema an agent sees — the interface is inspectable, not magic.

## Implementation (required)
- Vanilla ES modules, zero dependencies, zero build step; static hosting only. Data lives in `localStorage` — nothing leaves the browser (GDPR-friendly by construction).
- `js/webmcp.js` feature-detects `document.modelContext.registerTool` (with `navigator.modelContext` as the legacy shape) and registers each tool with a per-tool `AbortController`; `toolchange` is surfaced in the UI.
- `js/tools.js` holds the eleven schemas + executes. One shared runner (`runTool`) wraps every call — WebMCP agent, playground, and the scripted demo agent all go through it — so the activity log, result summaries and error handling are identical regardless of caller.
- Approvals are first-class records (`pending → approved | edited | rejected`) in the same store; `get_approval` exposes them to the agent with explicit guidance strings.
- 16 tests over the tool logic and store queries (`node --test tests/`).
- Graceful degradation: without a WebMCP host, the page shows "local mode" and the same tools remain usable via the playground / demo agent — judges never hit a dead end.

## Testing instructions (private field on the form)
No login required. Open the URL in ChatGPT's in-app browser and ask it to "show stale deals and draft a follow-up for the most valuable one", then approve or edit the draft in the Approvals tab. In Chrome, enable `chrome://flags/#enable-webmcp-testing` and reload. Without any agent, use "Tool Playground" and "Run demo agent" on the page.

## Notes for judges
Demo data is fictional and regenerates with fresh relative dates on every reset ("↺" button). Nothing is sent anywhere, ever — the email "send" is deliberately out of scope; the approval gate is the product statement.
