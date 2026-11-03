/**
 * Muse Spark Open via Baseten inference — optional LLM fallback, Muse primary.
 *
 * When the Meta Model API fails (429/5xx) on a draft/fix/rank step, the Muse
 * clients retry the same prompt once here instead of failing the run. The
 * endpoint is OpenAI-compatible, so the request shape matches lib/muse.ts.
 * Verdicts stay on Muse Wonder unless BASETEN_INFERENCE_ALLOW_VERDICT=1: the
 * strict paper judge is the pay-judge line, so a fallback judge is opt-in twice.
 *
 * Why a separate file: one file per provider (repo rule). Nothing outside
 * lib/muse.ts and lib/muse-agent.ts imports this.
 */

import { basetenInferenceConfigured, basetenInferenceKey, env, notConfigured, type Result } from './env';
import { recordTokens, type ApiUsage } from './usage';

export type ChatMessage = { role: string; content: unknown };

/**
 * muse.ts labels and muse-agent.ts tasks the fallback may serve. Draft-family
 * work (draft/notebook), cheap retries (fix) and classification (rank) degrade
 * gracefully; plan/choose/verdict need Muse judgement, so they fail loudly.
 */
const FALLBACK_OK = new Set(['draft', 'notebook', 'fix', 'rank']);

function flag(name: string): boolean {
  return process.env[name] === '1' || process.env[name] === 'true';
}

/**
 * Pure gate (no network) so tests pin the policy: fallback needs an explicit
 * opt-in plus a key, and verdicts need a second opt-in.
 */
export function sparkOpenFallbackAllowed(kind: string): boolean {
  if (!basetenInferenceConfigured()) return false;
  if (!flag('BASETEN_INFERENCE_FALLBACK')) return false;
  if (kind === 'verdict') return flag('BASETEN_INFERENCE_ALLOW_VERDICT');
  return FALLBACK_OK.has(kind);
}

/** Endpoint and model, read live so tests and deploys see current env (defaults in lib/env.ts). */
export function sparkOpenEndpoint(): { url: string; model: string } {
  return {
    url: `${(process.env.BASETEN_INFERENCE_API_URL || env.basetenInferenceUrl).replace(/\/$/, '')}/chat/completions`,
    model: process.env.BASETEN_INFERENCE_MODEL || env.basetenInferenceModel,
  };
}

/** One OpenAI-compatible chat call against Spark Open. Records tokens under the Baseten provider. */
export async function chatSparkOpen(label: string, messages: ChatMessage[], json = false): Promise<Result<string>> {
  const key = basetenInferenceKey();
  if (!key) return notConfigured('baseten');
  const { url, model } = sparkOpenEndpoint();
  // Temperature 0.2 matches the Muse non-wonder tiers; the fallback only serves
  // draft/fix/rank (plus explicitly opted-in verdicts), never wonder-by-default.
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.2, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  });
  if (!res.ok) return { ok: false, error: `Muse Spark Open failed: ${res.status} ${await res.text()}` };
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: ApiUsage };
  recordTokens('baseten', model, label, body.usage);
  const content = body.choices?.[0]?.message?.content;
  return content ? { ok: true, value: content } : { ok: false, error: 'Muse Spark Open returned no content' };
}
