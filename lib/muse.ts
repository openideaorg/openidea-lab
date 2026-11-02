/**
 * Muse via the Meta Model API — plan / draft / enrich.
 *
 * Model ids are chosen per task in lib/muse-models.ts (Wonder vs Spark vs SAM).
 * Auth: META_API_KEY via keyFor('meta') (Cursor / Claude Code Muse keys).
 *
 * OpenAI-compatible chat completions at https://api.meta.ai/v1
 * (https://dev.meta.ai/docs/protocols/chat-completions).
 */

import { env, keyFor, notConfigured, type Result } from './env';
import { routeMuseModel, type MuseTask, type RouteHint } from './muse-models';
import type { Resource } from './openidea';
import { recordTokens, type ApiUsage } from './usage';

const META_API = `${env.metaApiUrl}/chat/completions`;

export interface Plan {
  summary: string;
  buildable: boolean;
  exists: string[];
  missing: string[];
  steps: string[];
}

export interface GeneratedFile {
  path: string;
  content: string;
}

async function chat(
  task: MuseTask,
  label: string,
  system: string,
  user: string,
  json = false,
  hint?: RouteHint,
): Promise<Result<string>> {
  const key = keyFor('meta');
  if (!key) return notConfigured('meta');
  const route = routeMuseModel(task, hint);
  const model = route.model;

  const res = await fetch(META_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) return { ok: false, error: `Muse (${model}) failed: ${res.status} ${await res.text()}` };
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: ApiUsage };
  recordTokens('meta', model, label, body.usage);
  const content = body.choices?.[0]?.message?.content;
  return content ? { ok: true, value: content } : { ok: false, error: `Muse (${model}) returned no content` };
}

/** Idea flow: is it buildable, what exists, what is missing, how to build it. */
export async function planIdea(idea: string, context: Resource[], graph = ''): Promise<Result<Plan>> {
  const system =
    'You assess whether an idea can be built today from open research, code, datasets and hardware. ' +
    'Answer as JSON: {"summary": string, "buildable": boolean, "exists": string[], "missing": string[], "steps": string[]}. ' +
    'Be concrete. Name the resources you rely on by title. When the knowledge graph names technologies the resources ' +
    'share, treat those as the proven building blocks and say what is NOT covered by any of them.';
  const user = `Idea:\n${idea}\n\nRelevant open resources:\n${describe(context)}${graph ? `\n\nKnowledge graph:\n${graph}` : ''}`;
  const r = await chat('plan', 'plan', system, user, true);
  return r.ok ? parseJson<Plan>(r.value) : r;
}

/** Idea flow: a small runnable prototype as a file list. */
export async function draftPrototype(idea: string, plan: Plan): Promise<Result<GeneratedFile[]>> {
  const system =
    'You write a minimal runnable prototype as a Vite + React + TypeScript project. ' +
    'Return JSON: {"files": [{"path": string, "content": string}]}. Include package.json, index.html, src/main.tsx, src/App.tsx. ' +
    'No external packages beyond react and react-dom. Keep it under 200 lines.';
  const user = `Idea:\n${idea}\n\nPlan:\n${plan.steps.join('\n')}`;
  const r = await chat('draft', 'draft', system, user, true);
  return r.ok ? parseJson<{ files: GeneratedFile[] }>(r.value).then(unwrapFiles) : r;
}

/** Paper flow: a notebook that reproduces one key result on small data. */
export async function draftNotebook(paperText: string, context: Resource[]): Promise<Result<GeneratedFile[]>> {
  const system =
    'You reproduce the key result of a research paper as ONE Python script that runs in Pyodide ' +
    '(numpy, pandas, matplotlib, scikit-learn available; no torch, no network, no files to download). ' +
    'Pick ONE figure or table that can be reproduced on a small synthetic or bundled sample, and say which in the README. ' +
    'Rules that keep the result honest: ' +
    '(1) Fix the random seed. ' +
    '(2) Average over at least 20 trials and plot the mean with a shaded standard error. ' +
    '(3) For any least-squares or linear fit, use the minimum-norm solution via numpy.linalg.pinv or lstsq with rcond=None; never invert a Gram matrix directly, it blows up when parameters exceed samples. ' +
    '(4) Before plotting, CHECK the result against the claim in code (for example: is the peak within one grid step of the predicted point? does the curve fall after it?) and print a line starting with "CHECK:" saying pass or fail and the numbers. ' +
    '(5) If the check fails, adjust the experiment (grid, sample size, noise) once within the script and re-run before plotting. ' +
    '(6) Print the table of values the figure is drawn from, then call plt.show(). ' +
    'Return JSON: {"files": [{"path": "reproduce.py", "content": string}, {"path": "README.md", "content": string}]}. ' +
    'The README states the claim being tested in one sentence, the synthetic setup, and what "CHECK: pass" means.';
  const user = `Paper text (truncated):\n${paperText.slice(0, 60_000)}\n\nRelated open code and data:\n${describe(context)}`;
  const r = await chat('draft', 'notebook', system, user, true);
  return r.ok ? parseJson<{ files: GeneratedFile[] }>(r.value).then(unwrapFiles) : r;
}

/** Photo flow: enrich a labelled parts list with datasheets and prices from search results. */
export async function enrichParts(parts: string[], context: Resource[]): Promise<Result<string>> {
  const system =
    'Given electronic or mechanical parts identified in a photo and open hardware search results, write a parts list in Markdown: ' +
    'part, likely model, datasheet link if present in the results, rough price, and what it does in this assembly.';
  const user = `Parts:\n${parts.join('\n')}\n\nSearch results:\n${describe(context)}`;
  return chat('enrich', 'parts', system, user);
}

function describe(resources: Resource[]): string {
  if (!resources.length) return '(none)';
  return resources
    .slice(0, 20)
    .map((r) => `- [${r.type}] ${r.title} (${r.url})${r.description ? `: ${r.description.slice(0, 200)}` : ''}`)
    .join('\n');
}

async function parseJson<T>(text: string): Promise<Result<T>> {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, error: 'Muse returned invalid JSON' };
  }
}

function unwrapFiles(r: Result<{ files: GeneratedFile[] }>): Result<GeneratedFile[]> {
  if (!r.ok) return r;
  return Array.isArray(r.value.files) ? { ok: true, value: r.value.files } : { ok: false, error: 'No files in response' };
}
