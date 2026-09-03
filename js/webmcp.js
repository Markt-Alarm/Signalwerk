// WebMCP registration layer.
//
// Registers the page's tools with the browser so WebMCP agents (ChatGPT's
// in-app browser, Chrome with the testing flag) can discover and call them.
// When no WebMCP implementation is present — plain browsers, most judge
// laptops without the flag — everything degrades gracefully: the playground
// and demo agent call the exact same tool functions locally.

import { TOOLS, runAs, runTool } from './tools.js';
import { logActivity } from './store.js';

export const webmcp = {
  supported: false,
  usingFallback: true,
  context: null, // the ModelContext object when supported
  registered: [], // tool names the browser accepted
  controllers: [],
};

function modelContext() {
  // document.modelContext is the current form; navigator.modelContext is the
  // shape used by earlier implementations and some agent hosts.
  if (typeof document.modelContext?.registerTool === 'function') return document.modelContext;
  if (typeof navigator.modelContext?.registerTool === 'function') return navigator.modelContext;
  return null;
}

export async function initWebMCP({ onStatus } = {}) {
  const mc = modelContext();
  if (!mc) {
    webmcp.usingFallback = true;
    onStatus?.(webmcp);
    return webmcp;
  }

  webmcp.supported = true;
  webmcp.usingFallback = false;
  webmcp.context = mc;

  for (const tool of TOOLS) {
    try {
      const controller = new AbortController();
      await mc.registerTool(
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          execute: (args) => runRegistered(tool.name, args),
        },
        { signal: controller.signal },
      );
      webmcp.controllers.push(controller);
      webmcp.registered.push(tool.name);
    } catch (error) {
      console.error(`WebMCP: registering ${tool.name} failed`, error);
      logActivity({
        actor: 'system',
        summary: `WebMCP registration failed for ${tool.name}: ${error.message}`,
      });
    }
  }

  // Surface registration/unregistration from other sources in the activity feed.
  try {
    mc.addEventListener?.('toolchange', () => {
      logActivity({ actor: 'system', summary: 'Browser reports a toolchange (tool set updated).' });
    });
  } catch {
    // toolchange is optional.
  }

  onStatus?.(webmcp);
  return webmcp;
}

async function runRegistered(name, args) {
  const tool = TOOLS.find((entry) => entry.name === name);
  if (!tool) throw new Error(`Unknown tool ${name}`);
  // A real WebMCP call comes from the agent, so the feed marks it as such.
  runAs('agent');
  const outcome = await runTool(name, args);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.result;
}
