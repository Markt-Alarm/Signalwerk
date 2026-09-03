# Demo video script — 2:30 target (hard limit 3:00)

Record at 1440p+, browser zoom ~110%, dark room tone. Speak plainly; describe
what is on screen. German spoken version is fine — add EN subtitles.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:12 | Board loads, brief pause on the header | "This is Signalwerk — a sales pipeline that was built for agents from day one. It publishes eleven first-party tools over WebMCP, so any AI agent can work it *with* me — not by clicking around my UI." |
| 0:12–0:30 | Open the Tools tab, scroll the list briefly | "Every capability is registered with `document.modelContext.registerTool` — real JSON schemas, read hints, and one tool that is deliberately special: `draft_followup`." |
| 0:30–0:50 | Switch to ChatGPT in-app browser (or say it while on the board). Ask: "Which deals have gone stale?" | "I ask my agent what's stale. It calls `find_stale_leads` — see the call appear in the activity feed, and the board pulse where it looked." |
| 0:50–1:15 | Ask: "Draft a follow-up for the most valuable neglected one." Draft appears in Approvals tab | "It reads the lead, writes the message, and queues it — and here's the point: it *cannot send anything*. `draft_followup` has no side effects on the pipeline. The draft sits in my Approvals tab until I decide." |
| 1:15–1:45 | Edit the draft text, click "Edit & approve", then point at the feed as the agent continues | "I don't have to take the agent's word. I'll rewrite the middle — and approve my version. The agent picks up `human_message` via `get_approval`, logs the touchpoint, and schedules the next step. Human-in-the-loop as a protocol, not a checkbox." |
| 1:45–2:05 | Open Tool Playground, run `get_pipeline_overview` by hand | "No agent installed? Same tools, run by hand. The Playground drives the exact functions an agent would call — schemas, results, everything inspectable. And there's a scripted demo agent for the full loop." |
| 2:05–2:25 | Show footer + badge; brief code flash of `registerTool` in the repo | "Zero dependencies, no backend, your data never leaves the browser. The page *is* the MCP server — that's the future WebMCP is pointing at: humans and agents working the same surface, with the human holding the veto." |
| 2:25–2:30 | Logo card | "Signalwerk. The agent drafts. You decide." |

## Production checklist
- [ ] Browser window clean (no bookmarks chaos — use a fresh profile)
- [ ] Fresh data first: click ↺ (reset) before recording
- [ ] Activity feed visible the whole time (bottom panel) — it's the proof
- [ ] Audio: quiet room, no echo; subtitles EN (judges are EN)
- [ ] Upload public/unlisted-to-public on YouTube, title "Signalwerk — WebMCP Challenge demo"
- [ ] Keep the raw take under 3:00 — trim silences, don't speed up speech
