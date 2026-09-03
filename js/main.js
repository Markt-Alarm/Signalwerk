// Boot: load state, render UI, register WebMCP tools, wire the extras.

import { loadState } from './store.js';
import { initUi, renderBadge } from './ui.js';
import { initWebMCP } from './webmcp.js';
import { initPlayground } from './playground.js';
import { initDemoAgent } from './demo-agent.js';

loadState();
initUi();
initPlayground();
initDemoAgent();

initWebMCP({ onStatus: renderBadge });
