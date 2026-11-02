/**
 * Muse Spark via the Meta Model API — the only model provider Lab Pro calls.
 *
 * Three tiers, one API (https://dev.meta.ai/docs, OpenAI-compatible chat
 * completions). The tier is the cost control for the ≤$20 credit:
 *
 *   - contributor (META_MODEL, default muse-spark-1.3-contributor): explore and
 *     edits — rank search results, patch sandbox errors, name photo parts.
 *     These run often (up to 3 fixes per build) so they must be the cheapest.
 *   - heavy (META_MODEL_HEAVY, default muse-spark-1.3): plan + first draft.
 *     Called once or twice per flow, where reasoning matters most.
 *   - wonder (META_MODEL_WONDER, default muse-wonder-1.0): architecture and
 *     verdicts — strict judgement calls, one per paper run.
 *
 * Each export names its tier in the usage label (plan, draft, notebook, parts,
 * rank, fix, label, verdict) so the credit dashboard shows where the money went.
 */

import { env, keyFor, notConfigured, type Result } from './env';
import type { Resource } from './openidea';
import { recordTokens, type ApiUsage } from './usage';

const META_API = `${env.metaApiUrl}/chat/completions`;

/** Tier names for the usage panel. */
export type MuseTier = 'contributor' | 'heavy' | 'wonder';

/**
 * Model for a tier, read live from the environment so tests and deploys see
 * the current value (lib/env.ts is read once at import). Falls back down the
 * tiers: an unset HEAVY/WONDER uses META_MODEL, so one variable still works.
 */
export function modelFor(tier: MuseTier): string {
  if (tier === 'heavy') return process.env.META_MODEL_HEAVY || process.env.META_MODEL || 'muse-spark-1.3';
  if (tier === 'wonder') return process.env.META_MODEL_WONDER || process.env.META_MODEL || 'muse-wonder-1.0';
  return process.env.META_MODEL || 'muse-spark-1.3-contributor';
}

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

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
// Mixed text+image arrays ride the same OpenAI-compatible content field; the
// old single-kind arrays still assign, so existing callers are untouched.
type Content = string | ContentPart[];

async function chat(tier: MuseTier, label: string, system: string, user: Content, json = false): Promise<Result<string>> {
  const key = keyFor('meta');
  if (!key) return notConfigured('meta');
  const model = modelFor(tier);
  // One retry on 429/5xx: the demo hits the API in bursts (plan then draft),
  // and a single immediate retry rides out rate-limit windows without adding
  // a dependency for backoff.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(META_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: tier === 'wonder' ? 0.1 : 0.2,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (!res.ok) return { ok: false, error: `Muse Spark failed: ${res.status} ${await res.text()}` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: ApiUsage };
    recordTokens('meta', model, label, body.usage);
    const content = body.choices?.[0]?.message?.content;
    return content ? { ok: true, value: content } : { ok: false, error: 'Muse Spark returned no content' };
  }
  return { ok: false, error: 'Muse Spark failed: retry exhausted' };
}

/** Idea flow: is it buildable, what exists, what is missing, how to build it. */
export async function planIdea(idea: string, context: Resource[], graph = ''): Promise<Result<Plan>> {
  const system =
    'You assess whether an idea can be built today from open research, code, datasets and hardware. ' +
    'Answer as JSON: {"summary": string, "buildable": boolean, "exists": string[], "missing": string[], "steps": string[]}. ' +
    'Be concrete. Name the resources you rely on by title. When the knowledge graph names technologies the resources ' +
    'share, treat those as the proven building blocks and say what is NOT covered by any of them. ' +
    'Keep steps to 4 or fewer, each one a runnable increment (observe → act order: search, draft, run, hand off).';
  const user = `Idea:\n${idea}\n\nRelevant open resources:\n${describe(context)}${graph ? `\n\nKnowledge graph:\n${graph}` : ''}`;
  // Heavy tier: this is the architecture decision for the whole run.
  const r = await chat('heavy', 'plan', system, user, true);
  return r.ok ? parseJson<Plan>(r.value) : r;
}

/** Idea flow: a small runnable prototype as a file list. */
export async function draftPrototype(idea: string, plan: Plan): Promise<Result<GeneratedFile[]>> {
  const system =
    'You write a minimal runnable prototype as a Vite + React + TypeScript project. ' +
    'Return JSON: {"files": [{"path": string, "content": string}]}. Include package.json, index.html, src/main.tsx, src/App.tsx. ' +
    'No external packages beyond react and react-dom. Keep it under 200 lines.';
  const user = `Idea:\n${idea}\n\nPlan:\n${plan.steps.join('\n')}`;
  // Heavy tier: the one big code write per idea run.
  const r = await chat('heavy', 'draft', system, user, true);
  if (!r.ok) return r;
  const parsed = await parseJson<{ files: GeneratedFile[] }>(r.value);
  if (!parsed.ok) return parsed;
  const files = unwrapFiles(parsed);
  if (!files.ok) return files;
  return sanitizeFiles(files.value);
}

/** Paper flow: a notebook that reproduces one key result on small data. */
export async function draftNotebook(paperText: string, context: Resource[]): Promise<Result<{ files: GeneratedFile[]; claim: string }>> {
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
    '(6) Always run a null baseline next to the main experiment — the same script on shuffled/permuted labels or another no-structure control — and print its number beside the main number. A claim passes only if it beats the baseline outside the standard error; a script without a baseline cannot pass, because "it runs" is not a reproduction. ' +
    '(7) Print the table of values the figure is drawn from, then call plt.show(). ' +
    'Return JSON: {"claim": string, "files": [{"path": "reproduce.py", "content": string}, {"path": "README.md", "content": string}]}. ' +
    'The README states the claim being tested in one sentence with its numeric bar, the synthetic setup, the baseline, and what "CHECK: pass" means in numbers. ' +
    'The "claim" field is the single testable sentence the verdict step will judge (e.g. "Test error peaks at interpolation threshold n=d then falls"), not a summary of the paper.';
  // 12k chars (~3k tokens) of paper text: enough for the key result and
  // method, while the heavy call stays cents on the ≤$20 credit.
  const user = `Paper text (truncated):\n${paperText.slice(0, 12_000)}\n\nRelated open code and data:\n${describe(context)}`;
  // Heavy tier: the one big code write per paper run.
  const r = await chat('heavy', 'notebook', system, user, true);
  if (!r.ok) return r;
  const parsed = await parseJson<{ files: GeneratedFile[]; claim?: string }>(r.value);
  if (!parsed.ok) return parsed;
  const files = unwrapFiles({ ok: true, value: { files: parsed.value.files } });
  if (!files.ok) return files;
  const clean = sanitizeFiles(files.value);
  if (!clean.ok) return clean;
  // The claim is the paper-ingest handoff: the verdict step judges this exact
  // sentence, not the raw pasted text. Fall back to the README when the model
  // returns files without a claim (older prompt shape).
  const claim = parsed.value.claim?.trim() || claimFromReadme(clean.value) || paperText.slice(0, 500);
  return { ok: true, value: { files: clean.value, claim } };
}

/** Photo flow: enrich a labelled parts list with datasheets and prices from search results. */
export async function enrichParts(parts: string[], context: Resource[]): Promise<Result<string>> {
  const system =
    'Given electronic or mechanical parts identified in a photo and open hardware search results, write a parts list in Markdown: ' +
    'part, likely model, datasheet link if present in the results, rough price, and what it does in this assembly.';
  const user = `Parts:\n${parts.join('\n')}\n\nSearch results:\n${describe(context)}`;
  // Contributor tier: summarising named parts against search results needs no
  // heavy reasoning; this keeps the photo flow the cheapest run of the three.
  return chat('contributor', 'parts', system, user);
}

// ---------------------------------------------------------------------------
// Contributor tier: explore and edits (rank, fix, label). These run often, so
// they default to muse-spark-1.3-contributor. Same JSON-mode discipline as the
// heavy calls, smaller bills.
// ---------------------------------------------------------------------------

/** Keep the results that matter for this input. Returns ids in rank order. */
export async function rank(input: string, results: Resource[], keep = 6): Promise<Result<Resource[]>> {
  if (results.length <= keep) return { ok: true, value: results };
  // Title plus one line each: picking 6 of 20 does not need the descriptions in full.
  const listing = results.map((r, i) => `${i}. [${r.type}] ${r.title}: ${r.description?.slice(0, 120) ?? ''}`).join('\n');
  const r = await chat(
    'contributor',
    'rank',
    `Pick the ${keep} results most useful for building the input. Return JSON {"keep": number[]} with indices in rank order.`,
    `Input:\n${input}\n\nResults:\n${listing}`,
    true,
  );
  if (!r.ok) return r;
  try {
    const { keep: idx } = JSON.parse(r.value) as { keep: number[] };
    return { ok: true, value: idx.map((i) => results[i]).filter(Boolean).slice(0, keep) };
  } catch {
    return { ok: true, value: results.slice(0, keep) };
  }
}

export interface FixAttempt {
  /** Normalised fingerprint of the error (see lib/runner/types.ts). */
  fingerprint: string;
  /** First line of the error, for the prompt. */
  headline: string;
}

/**
 * Patch the files so the reported error goes away. Returns the full file list.
 *
 * The observe step: `history` carries the fingerprints of earlier errors this
 * run, so the model sees that its last patch did not work instead of buying
 * the same patch back. The flow also stops before calling when the fingerprint
 * repeats — this is the backstop for when the model ignores the history.
 */
export async function fix(files: GeneratedFile[], error: string, attempt = 1, history: FixAttempt[] = []): Promise<Result<GeneratedFile[]>> {
  const past =
    history.length === 0
      ? ''
      : ` Earlier attempts failed with: ${history.map((h) => h.headline).join(' | ')}. Do NOT repeat those patches; diagnose why they failed and change a different file or line.`;
  const r = await chat(
    'contributor',
    'fix',
    'You fix a small project so it runs. Change as little as possible. Return JSON {"files": [{"path": string, "content": string}]} with EVERY file, changed or not.' +
      (attempt > 1
        ? ` This is fix attempt ${attempt}: a previous fix did not resolve the error, so try a different change instead of repeating the last patch.${past}`
        : ''),
    `Error:\n${error}\n\nFiles:\n${files.map((f) => `--- ${f.path}\n${f.content}`).join('\n\n')}`,
    true,
  );
  if (!r.ok) return r;
  const parsed = await parseJson<{ files: GeneratedFile[] }>(r.value);
  if (!parsed.ok) return { ok: false, error: 'Fix returned invalid JSON' };
  const out = unwrapFiles(parsed);
  if (!out.ok) return { ok: false, error: 'Fix returned no files' };
  return sanitizeFiles(out.value);
}

export interface LabelledPart {
  index: number;
  name: string;
  confidence: number;
}

/** Name each segmented part from a crop (data URL). */
export async function labelParts(crops: string[]): Promise<Result<LabelledPart[]>> {
  const r = await chat(
    'contributor',
    'label',
    'Each image is one part cut out of a photo of hardware. Name it (e.g. "ESP32 module", "M3 hex bolt", "16x2 LCD"). ' +
      'Return JSON {"parts": [{"index": number, "name": string, "confidence": number}]}.',
    crops.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
    true,
  );
  if (!r.ok) return r;
  try {
    const { parts } = JSON.parse(r.value) as { parts: LabelledPart[] };
    return { ok: true, value: parts };
  } catch {
    return { ok: false, error: 'Labeller returned invalid JSON' };
  }
}

/**
 * Agent-loop labelling: name each SAM segment from the full photo plus its box
 * list. The /photo UI crops client-side on a canvas; the server has no image
 * decoder and must not gain one for this, so the boxes travel as text and the
 * full image as a single vision input. Same JSON contract as labelParts.
 */
export async function labelSegments(
  image: string,
  boxes: { index: number; bbox: [number, number, number, number]; score: number }[],
): Promise<Result<LabelledPart[]>> {
  const listing = boxes
    .map((b) => `#${b.index}: [x=${b.bbox[0]}, y=${b.bbox[1]}, w=${b.bbox[2]}, h=${b.bbox[3]}] score ${b.score.toFixed(2)}`)
    .join('\n');
  const r = await chat(
    'contributor',
    'label',
    'You see one photo of hardware. Below it is a numbered list of bounding boxes in pixels of this exact image. ' +
      'Name the part inside EACH box (e.g. "ESP32 module", "M3 hex bolt", "16x2 LCD"). ' +
      'Return JSON {"parts": [{"index": number, "name": string, "confidence": number}]} with one entry per box, in box order.',
    [
      { type: 'image_url', image_url: { url: image } },
      { type: 'text', text: `Boxes:\n${listing}` },
    ],
    true,
  );
  if (!r.ok) return r;
  try {
    const { parts } = JSON.parse(r.value) as { parts: LabelledPart[] };
    return { ok: true, value: parts };
  } catch {
    return { ok: false, error: 'Labeller returned invalid JSON' };
  }
}

// ---------------------------------------------------------------------------
// Wonder tier: verdicts. Strict about the shape of the result, lenient about
// exact numbers — the build that "runs" is not a reproduction until this says so.
// ---------------------------------------------------------------------------

export interface Verdict {
  /** matches: the output shows the claimed effect; partial: the shape is there but weak or noisy; no: it does not. */
  verdict: 'matches' | 'partial' | 'no';
  reason: string;
  /** The single extra check that would raise this toward matches (absent when matches). */
  missing?: string;
}

/**
 * Parse the wonder tier's verdict JSON. Pure (no network) so the shape is
 * unit-testable: a buyer sees this line under every figure, so a malformed
 * one must fail loudly instead of rendering an empty verdict box.
 */
export function parseVerdict(text: string): Result<Verdict> {
  try {
    const v = JSON.parse(text) as Verdict;
    if (!['matches', 'partial', 'no'].includes(v.verdict)) return { ok: false, error: 'Verdict returned an unexpected value' };
    const reason = String(v.reason ?? '');
    if (!reason.trim()) return { ok: false, error: 'Verdict returned no reason' };
    const missing = typeof v.missing === 'string' && v.missing.trim() ? v.missing.trim().slice(0, 300) : undefined;
    return { ok: true, value: { verdict: v.verdict, reason, ...(missing ? { missing } : {}) } };
  } catch {
    return { ok: false, error: 'Verdict returned invalid JSON' };
  }
}

/**
 * Compare what the reproduction printed with the paper's claim. A build
 * that "runs" is not a reproduction — a toy that prints weights with no
 * CHECK line and no baseline caps at partial, never matches. This is the
 * line under the figure that says whether the result is the paper's result,
 * so the demo never overclaims.
 */
export async function verdict(claim: string, readme: string, output: string): Promise<Result<Verdict>> {
  const r = await chat(
    'wonder',
    'verdict',
    'You judge whether a small reproduction supports a paper\'s claim. You see the claim, the reproduction\'s own README and its printed output. ' +
      'Be strict about the SHAPE of the result (where peaks and minima fall, directions of change) and lenient about exact numbers, since the data is synthetic. ' +
      'A "matches" needs two things in the output: a line starting with "CHECK:" saying pass with the measured number, AND a null-baseline comparison (shuffled/permuted control) the claim beats outside the standard error. ' +
      'Cap at "partial" when the shape is right but the CHECK line or the baseline numbers are missing — name which is missing in "missing". ' +
      'Return "no" when the CHECK line says fail, the effect is absent or reversed, or the output does not test the claim at all. ' +
      'Return JSON {"verdict": "matches" | "partial" | "no", "reason": string, "missing": string}. The reason is one or two plain sentences a non-expert can follow, naming the number or line that decided it. "missing" is the single extra check that would raise this toward matches (empty string when matches).',
    `Claim (from the paper):\n${claim}\n\nREADME of the reproduction:\n${readme}\n\nPrinted output:\n${output}`,
    true,
  );
  if (!r.ok) return r;
  return parseVerdict(r.value);
}

// ---------------------------------------------------------------------------

function describe(resources: Resource[]): string {
  if (!resources.length) return '(none)';
  return resources
    .slice(0, 20)
    .map((r) => `- [${r.type}] ${r.title} (${r.url})${r.description ? `: ${r.description.slice(0, 200)}` : ''}`)
    .join('\n');
}

/**
 * Pull the testable claim out of a generated README without another model
 * call. The notebook prompt requires the README to state the claim in one
 * sentence; this finds that line so the verdict judges it. Pure string search,
 * so it is unit-testable and costs nothing.
 */
export function claimFromReadme(files: GeneratedFile[]): string {
  const readme = files.find((f) => /readme/i.test(f.path))?.content ?? '';
  // Require an explicit "Claim:" label so prose that merely mentions "claim"
  // (e.g. "No claim here.") does not become a false positive.
  const line = readme
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /\bclaim\b\s*:/i.test(l));
  if (!line) return '';
  // Strip a leading label ("Claim: ...") and markdown markers.
  return line
    .replace(/^#+\s*/, '')
    .replace(/^.*\bclaim\b[^:]*:\s*/i, '')
    .replace(/^\*\*?/, '')
    .trim()
    .slice(0, 500);
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

/**
 * Guard the plan/act/observe loop against model output the sandbox cannot
 * handle: paths that escape the project (`..`, absolute), empty paths, and
 * single files big enough to stall the browser runner. Returns the files
 * unchanged when they are fine, so the hot path pays nothing extra.
 */
export function sanitizeFiles(files: GeneratedFile[], maxFileChars = 60_000): Result<GeneratedFile[]> {
  if (!files.length) return { ok: false, error: 'No files in response' };
  for (const f of files) {
    const p = f.path.trim();
    if (!p || p.startsWith('/') || p.split('/').includes('..')) {
      return { ok: false, error: `Unsafe file path in model output: ${p.slice(0, 80)}` };
    }
    if (f.content.length > maxFileChars) {
      return { ok: false, error: `${p} is too large (${Math.round(f.content.length / 1000)} KB). Ask for a smaller prototype.` };
    }
  }
  return { ok: true, value: files };
}
