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
  /** @deprecated Prefer per-task ids in lib/muse-models.ts. Kept for dashboards / force-all. */
  metaModel: process.env.META_MODEL || 'muse-spark-1.3',
  fireworksCodeModel:
    process.env.FIREWORKS_CODE_MODEL || 'accounts/fireworks/models/deepseek-v4p1-flash',
  // Ranking 20 titles does not need the coder model; a small model is many times cheaper.
  fireworksRankModel:
    process.env.FIREWORKS_RANK_MODEL || process.env.FIREWORKS_CODE_MODEL || 'accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b',
  fireworksVisionModel:
    process.env.FIREWORKS_VISION_MODEL || 'accounts/fireworks/models/deepseek-v4p1-flash',
  basetenSam3ModelId: process.env.BASETEN_SAM3_MODEL_ID || '',
};

/** The shape every provider call returns, so callers never need try/catch for config. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string; missing?: string };

export function notConfigured<T>(provider: Provider): Result<T> {
  return { ok: false, error: `${provider} is not configured`, missing: missingKey(provider) };
}
