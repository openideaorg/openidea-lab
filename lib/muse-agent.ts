/**
 * Muse-only agent reasoning helpers — per-task model ids from muse-models.ts.
 *
 * Controller / verdict → Wonder; fix / rank → Spark; keys via META_API_KEY.
 */

import { env, keyFor, notConfigured, type Result } from './env';
import { chatSparkOpen, sparkOpenFallbackAllowed } from './baseten-muse-open';
import { routeMuseModel, type MuseTask, type RouteHint } from './muse-models';
import type { GeneratedFile } from './muse';
import type { Resource } from './openidea';
import { recordTokens, type ApiUsage } from './usage';
import type { LabVerdict, ToolCall } from './agent/types';

const META_API = `${env.metaApiUrl}/chat/completions`;

async function chat(
  task: MuseTask,
  label: string,
  messages: { role: string; content: string }[],
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
      messages,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) {
    // Same opt-in Spark Open fallback as lib/muse.ts: fix/rank degrade, while
    // choose/verdict fail loudly — the controller and the strict paper judge
    // stay on Muse Wonder by default.
    if ((res.status === 429 || res.status >= 500) && sparkOpenFallbackAllowed(task)) {
      return chatSparkOpen(label, messages, json);
    }
    return { ok: false, error: `Muse (${model}) failed: ${res.status} ${await res.text()}` };
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: ApiUsage };
  recordTokens('meta', model, label, body.usage);
  const content = body.choices?.[0]?.message?.content;
  return content ? { ok: true, value: content } : { ok: false, error: `Muse (${model}) returned no content` };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no json');
    return JSON.parse(m[0]);
  }
}

/** Controller: Muse Wonder picks exactly one tool. */
export async function chooseTool(
  playbook: string,
  stateSummary: string,
  history: { role: string; content: string }[],
): Promise<Result<ToolCall>> {
  const system =
    playbook +
    '\n\nRespond with ONLY JSON: {"tool": string, "args": object}. Pick one tool.';
  const messages = [
    { role: 'system', content: system },
    ...history.slice(-12),
    { role: 'user', content: `Current run state:\n${stateSummary}\n\nChoose the next tool.` },
  ];
  const r = await chat('choose', 'agent_choose', messages, true);
  if (!r.ok) return r;
  try {
    const parsed = extractJson(r.value) as { tool?: string; name?: string; args?: Record<string, unknown> };
    const name = parsed.tool || parsed.name;
    if (!name || typeof name !== 'string') return { ok: false, error: 'Muse did not name a tool' };
    return { ok: true, value: { name, args: parsed.args && typeof parsed.args === 'object' ? parsed.args : {} } };
  } catch {
    return { ok: false, error: 'Muse tool choice was not valid JSON' };
  }
}

/** Rank/trim search results with Muse Spark (classification). */
export async function museRank(input: string, results: Resource[], keep = 6): Promise<Result<Resource[]>> {
  if (results.length <= keep) return { ok: true, value: results };
  const listing = results.map((r, i) => `${i}. [${r.type}] ${r.title}: ${r.description?.slice(0, 120) ?? ''}`).join('\n');
  const r = await chat(
    'rank',
    'agent_rank',
    [
      {
        role: 'system',
        content: `Pick the ${keep} results most useful for building the input. Return JSON {"keep": number[]} with indices in rank order.`,
      },
      { role: 'user', content: `Input:\n${input}\n\nResults:\n${listing}` },
    ],
    true,
  );
  if (!r.ok) return r;
  try {
    const { keep: idx } = extractJson(r.value) as { keep: number[] };
    return { ok: true, value: (idx ?? []).map((i) => results[i]).filter(Boolean).slice(0, keep) };
  } catch {
    return { ok: true, value: results.slice(0, keep) };
  }
}

/**
 * Muse fix loop — Spark primary for hard fixes; Contributor on cheap retries
 * (attempt >= 2). Agent path never calls Fireworks.
 */
export async function museFix(
  files: GeneratedFile[],
  error: string,
  hint?: RouteHint,
): Promise<Result<GeneratedFile[]>> {
  const r = await chat(
    'fix',
    'agent_fix',
    [
      {
        role: 'system',
        content:
          'You fix a small project so it runs. Change as little as possible. Return JSON {"files": [{"path": string, "content": string}]} with EVERY file, changed or not.',
      },
      { role: 'user', content: `Error:\n${error}\n\nFiles:\n${files.map((f) => `--- ${f.path}\n${f.content}`).join('\n\n')}` },
    ],
    true,
    hint,
  );
  if (!r.ok) return r;
  try {
    const { files: out } = extractJson(r.value) as { files: GeneratedFile[] };
    return Array.isArray(out) && out.length ? { ok: true, value: out } : { ok: false, error: 'Fix returned no files' };
  } catch {
    return { ok: false, error: 'Fix returned invalid JSON' };
  }
}

/** Muse Wonder paper verdict — same strict bar as lib/muse.ts verdict (the agent loop's judge_paper calls this, so a weak prompt here would let toy reproductions pass and fail the pay-judge). */
export async function museVerdict(claim: string, readme: string, output: string): Promise<Result<LabVerdict>> {
  const r = await chat(
    'verdict',
    'agent_verdict',
    [
      {
        role: 'system',
        content:
          'Judge whether a small reproduction supports a paper claim. Be strict about the SHAPE of the result (where peaks and minima fall, directions of change) and lenient about exact numbers, since the data is synthetic. ' +
          'A "matches" needs two things in the output: a line starting with "CHECK:" saying pass with the measured number, AND a null-baseline comparison (shuffled/permuted control) the claim beats outside the standard error. ' +
          'Cap at "partial" when the shape is right but the CHECK line or the baseline numbers are missing — name which is missing in "missing". ' +
          'Return "no" when the CHECK line says fail, the effect is absent or reversed, or the output does not test the claim at all. ' +
          'Return JSON {"verdict": "matches" | "partial" | "no", "reason": string, "missing": string}. The reason is one or two plain sentences a non-expert can follow, naming the number or line that decided it. "missing" is the single extra check that would raise this toward matches (empty string when matches).',
      },
      { role: 'user', content: `Claim:\n${claim}\n\nREADME:\n${readme}\n\nPrinted output:\n${output}` },
    ],
    true,
  );
  if (!r.ok) return r;
  try {
    const v = extractJson(r.value) as LabVerdict;
    if (!['matches', 'partial', 'no'].includes(v.verdict)) throw new Error('bad');
    const reason = String(v.reason ?? '');
    if (!reason.trim()) throw new Error('bad');
    const missing = typeof v.missing === 'string' && v.missing.trim() ? v.missing.trim().slice(0, 300) : undefined;
    return { ok: true, value: { verdict: v.verdict, reason, ...(missing ? { missing } : {}) } };
  } catch {
    return { ok: false, error: 'Verdict returned invalid JSON' };
  }
}
