# Signalwerk — the agent-ready sales pipeline

**A WebMCP demo by [Werkstern](https://werkstern.de), Mainz.**

[Live demo](https://markt-alarm.github.io/Signalwerk/) · [Werkstern](https://werkstern.de) · [Contact](https://werkstern.de/kontakt)

Eine technische Arbeitsprobe: Menschen und KI-Agenten bearbeiten gemeinsam eine
B2B-Vertriebspipeline. Elf Werkzeuge machen die Abläufe nachvollziehbar;
Follow-up-Entwürfe warten auf menschliche Prüfung. Es werden keine Nachrichten
versendet. Die Anwendung ist eine lokale Browser-Demo, kein gehostetes CRM.

---

A lightweight B2B pipeline board that publishes its core functions as **first-party
WebMCP tools**, so any AI agent — ChatGPT's in-app browser, Chrome with the WebMCP
testing flag — can work the pipeline *together with* the human instead of
scraping the UI.

One principle drives every design decision:

> **The agent drafts, the human decides. Everything is logged. Nothing is a black box.**

No build step, no dependencies, no backend, no cookies. Your pipeline never
leaves the browser.

## Try it

**With a real agent:** open the live URL in ChatGPT's in-app browser (Site tools)
or in Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled, then ask:

- *"Which deals have gone stale?"*
- *"Draft a follow-up for the most valuable neglected lead."*
- *"What's in my pipeline, and what should I do next?"*

**Without an agent:** every tool is usable by hand. Click **Tool Playground**
to call any registered tool with a schema-driven form, or **Run demo agent**
to watch a scripted agent work the full loop — including the human approval gate.
Both run the exact same functions a WebMCP agent would call.

## What the agent gets

Eleven tools registered via `document.modelContext.registerTool()`:

| Tool | Kind | What it does |
|---|---|---|
| `get_pipeline_overview` | read | open deals, value, per-stage stats, staleness, pending approvals, current UI state |
| `search_leads` | read | free-text search with stage / value / staleness filters |
| `get_lead` | read | full profile with timeline |
| `find_stale_leads` | read | neglected deals sorted by value |
| `get_recent_activity` | read | the shared activity log (human *and* agent entries) |
| `get_approval` | read | the human's decision on a queued draft |
| `add_lead` | write | create a lead |
| `log_touchpoint` | write | record a call / email / meeting / note |
| `move_lead` | write | change pipeline stage |
| `schedule_followup` | write | set the next step and date |
| `draft_followup` | **approval-gated** | queue an outreach draft for human sign-off — never sends, never mutates |

### The approval gate (the interesting part)

`draft_followup` is the tool an agent could abuse. Signalwerk's answer is
architectural, not cosmetic: the tool **cannot** touch the pipeline. It queues
the draft in the human's Approvals tab and returns an `approval_id`. The human
approves, edits (the agent later reads `human_message`), or rejects. The agent
polls `get_approval` and acts on the verdict. That is human-in-the-loop as a
protocol, not a settings toggle.

### Shared context, visible agency

- Tool results include `ui_state` — what the human is currently looking at —
  so agent and human stay in sync.
- Every tool call (agent *or* human) lands in one activity feed, and the lead
  card an agent just touched pulses on the board. You always see what happened.

## Running locally

```bash
# any static server works
python -m http.server 8123
# → http://localhost:8123
```

Tests (no dependencies, plain `node:test`):

```bash
node --test tests/
```

## Deploy

Static hosting is enough. Netlify: `netlify deploy --prod` (config in
`netlify.toml`) or drag the folder onto app.netlify.com/drop. Vercel:
`vercel --prod` (`vercel.json` included). Cloudflare Pages / GitHub Pages work
as-is — upload the folder as-is, no build command, output dir `.`.

## Repository layout

```
index.html            single page
css/styles.css        hand-rolled design system (no framework)
js/store.js           state + localStorage persistence + queries
js/seed.js            twelve realistic demo leads (dates generated relative to now)
js/tools.js           the eleven tools: schemas, execute, shared runner, activity log
js/webmcp.js          feature detection + registerTool loop + toolchange handling
js/ui.js              board, drawer, agent space, approvals UI
js/playground.js      schema-driven manual tool runner
js/demo-agent.js      scripted agent for browsers without WebMCP
tests/tools.test.js   16 logic tests (node --test)
```

### Design notes for implementers

- **Feature detection** follows the spec draft and the Chrome/ChatGPT docs:
  `document.modelContext.registerTool` first, `navigator.modelContext` as the
  legacy shape, everything else degrades to local mode.
- Tools are registered with an `AbortController` signal per tool, so a page
  can unregister cleanly on teardown (SPA-friendly pattern).
- `execute` receives the destructured schema properties and returns plain
  objects with the ids needed to verify the effect — the "return enough
  information to verify the result" rule from the WebMCP guidance.
- The page works for humans with or without WebMCP; agents augment it.

## License

[MIT](LICENSE)
