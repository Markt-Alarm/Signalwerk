# Devpost submission text (paste-ready)

## Project title
Signalwerk — the agent-ready sales pipeline

## Short pitch (≤ 200 chars)
A sales pipeline that publishes 11 first-party WebMCP tools. Any agent can work it with you — but outreach drafts pass a human approval gate. Nothing ships without you.

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
