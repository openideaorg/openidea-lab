/**
 * Provider configuration, read once.
 *
 * Every provider is optional. A flow that needs a missing key reports
 * `{ ok: false, missing: 'META_API_KEY' }` instead of throwing, so the UI can
 * say exactly which key to set. This is what lets someone run the app with
 * nothing but a search key and still work on the UI.
 */

export type Provider = 'openidea' | 'meta' | 'fireworks' | 'baseten';

const KEYS: Record<Provider, string> = {
  openidea: 'OPENIDEA_API_KEY',
  meta: 'META_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  baseten: 'BASETEN_API_KEY',
};

export function keyFor(provider: Provider): string | null {
  return process.env[KEYS[provider]] || null;
}

export function missingKey(provider: Provider): string {
  return KEYS[provider];
}

export function configured(): Record<Provider, boolean> {
  return {
    openidea: !!keyFor('openidea'),
    meta: !!keyFor('meta'),
    fireworks: !!keyFor('fireworks'),
    baseten: !!keyFor('baseten') && !!process.env.BASETEN_SAM3_MODEL_ID,
  };
}

export const env = {
  labUrl: process.env.NEXT_PUBLIC_LAB_URL || 'http://localhost:3000',
  openideaUrl: process.env.OPENIDEA_API_URL || 'https://openidea.world/api/v1',
  metaApiUrl: (process.env.META_API_URL || 'https://api.meta.ai/v1').replace(/\/$/, ''),
  /**
   * Lab Pro model tiers (one provider, three prices). Why three: the fix loop
   * runs up to 3x per build and ranking reads 20 results, so those must be the
   * cheapest calls; the first draft needs the most reasoning; verdicts need
   * judgement, not code. Defaults keep a $20 credit to 40+ demo runs.
   */
  /** Cheap default: explore, rank, fix, label. */
  metaModel: process.env.META_MODEL || 'muse-spark-1.3-contributor',
  /** Heavy coding: plan + first draft. Falls back to metaModel when unset. */
  metaHeavyModel: process.env.META_MODEL_HEAVY || process.env.META_MODEL || 'muse-spark-1.3',
  /** Architecture / verdicts: strict judgement calls. Falls back to metaModel. */
  metaWonderModel: process.env.META_MODEL_WONDER || process.env.META_MODEL || 'muse-wonder-1.0',
  fireworksCodeModel:
    process.env.FIREWORKS_CODE_MODEL || 'accounts/fireworks/models/deepseek-v4p1-flash',
  // Ranking 20 titles does not need the coder model; a small model is many times cheaper.
  fireworksRankModel:
    process.env.FIREWORKS_RANK_MODEL || process.env.FIREWORKS_CODE_MODEL || 'accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b',
  fireworksVisionModel:
    process.env.FIREWORKS_VISION_MODEL || 'accounts/fireworks/models/deepseek-v4p1-flash',
  basetenSam3ModelId: process.env.BASETEN_SAM3_MODEL_ID || '',
  /**
   * Baseten-hosted Muse Spark Open (OpenAI-compatible inference). Optional LLM
   * fallback when Muse fails; defaults live here so no other file literals them
   * (repo rule), but the client reads process.env live so tests can override.
   */
  basetenInferenceUrl: process.env.BASETEN_INFERENCE_API_URL || 'https://inference.baseten.co/v1',
  basetenInferenceModel: process.env.BASETEN_INFERENCE_MODEL || 'meta-models/muse-spark-open-1026',
};

/** The shape every provider call returns, so callers never need try/catch for config. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string; missing?: string };

export function notConfigured<T>(provider: Provider): Result<T> {
  return { ok: false, error: `${provider} is not configured`, missing: missingKey(provider) };
}

/**
 * Key for the Baseten inference endpoint (Muse Spark Open). Falls back to the
 * shared Baseten key so one variable covers SAM 3 + inference. Read live so
 * tests and deploys see the current value.
 */
export function basetenInferenceKey(): string | null {
  return process.env.BASETEN_INFERENCE_API_KEY || keyFor('baseten');
}

/** The Spark Open fallback needs a key; the SAM 3 model id is irrelevant to it. */
export function basetenInferenceConfigured(): boolean {
  return !!basetenInferenceKey();
}
