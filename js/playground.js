// Tool Playground: lets a human run every registered tool by hand with
// schema-driven forms. Same code path the agent uses, so it doubles as a test
// harness and works in browsers without WebMCP.

import { TOOLS, runTool } from './tools.js';
import { toast } from './ui.js';

let selected = TOOLS[0].name;

export function initPlayground() {
  const dialog = document.getElementById('playground');
  document.getElementById('btn-playground').addEventListener('click', () => {
    dialog.showModal();
    renderToolList();
    renderForm();
  });
  document.getElementById('playground-close').addEventListener('click', () => dialog.close());
  document.getElementById('playground-copy').addEventListener('click', copyResult);

  document.getElementById('playground-form').addEventListener('submit', (event) => {
    event.preventDefault();
    runSelected();
  });
}

function renderToolList() {
  const wrap = document.getElementById('playground-tools');
  wrap.innerHTML = '';
  for (const tool of TOOLS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `pg-tool ${tool.name === selected ? 'is-active' : ''}`;
    button.textContent = tool.name;
    button.addEventListener('click', () => {
      selected = tool.name;
      renderToolList();
      renderForm();
    });
    wrap.append(button);
  }
}

function renderForm() {
  const form = document.getElementById('playground-form');
  const tool = TOOLS.find((entry) => entry.name === selected);
  form.innerHTML = '';

  const head = document.createElement('p');
  head.className = 'muted small';
  head.textContent = tool.description;
  form.append(head);

  const properties = tool.inputSchema.properties || {};
  const required = tool.inputSchema.required || [];
  for (const [key, schema] of Object.entries(properties)) {
    const field = document.createElement('label');
    field.className = 'field';
    const label = document.createElement('span');
    label.innerHTML = `${key}${required.includes(key) ? ' <span class="req">*</span>' : ''}`;
    field.append(label);

    let input;
    if (schema.enum) {
      input = document.createElement('select');
      for (const option of schema.enum) {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        input.append(opt);
      }
    } else if (schema.type === 'number') {
      input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
    } else if (/message|text|note|summary|query|description/.test(key)) {
      input = document.createElement('textarea');
    } else {
      input = document.createElement('input');
      input.type = 'text';
    }
    input.name = key;
    input.id = `pg-${key}`;
    if (schema.description) input.title = schema.description;
    field.append(input);
    form.append(field);
  }

  if (!Object.keys(properties).length) {
    const none = document.createElement('p');
    none.className = 'muted small';
    none.textContent = 'This tool takes no arguments.';
    form.append(none);
  }

  const run = document.createElement('button');
  run.className = 'btn btn-primary';
  run.type = 'submit';
  run.textContent = `Run ${tool.name}`;
  form.append(run);
}

async function runSelected() {
  const form = document.getElementById('playground-form');
  const output = document.getElementById('playground-output');
  const args = {};
  for (const field of form.querySelectorAll('input, select, textarea')) {
    if (!field.name) continue;
    const raw = field.value.trim();
    if (raw === '') continue;
    args[field.name] = field.type === 'number' ? Number(raw) : raw;
  }

  output.className = 'result';
  output.textContent = `→ ${selected}(${JSON.stringify(args)}) …`;
  const outcome = await runTool(selected, args, { actor: 'human' });
  output.textContent = JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }, null, 2);
  output.classList.add(outcome.ok ? 'ok' : 'err');
}

async function copyResult() {
  const text = document.getElementById('playground-output').textContent;
  try {
    await navigator.clipboard.writeText(text);
    toast('Result copied.');
  } catch {
    toast('Clipboard blocked by the browser.');
  }
}
