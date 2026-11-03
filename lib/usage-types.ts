/**
 * Usage records and their totals. Pure data and arithmetic, so the browser can
 * import it; the server-side recorder is in usage.ts.
 *
 * Meta and Fireworks bill per token. Baseten bills SAM 3 by GPU time, so it
 * has no token count: we record how long each call held the endpoint instead.
 * Costs are optional and only appear when the matching price variables are
 * set in the environment, because list prices change and are not ours to guess.
 */

export type TokenProvider = 'meta' | 'fireworks' | 'baseten';

export interface TokenEntry {
  kind: 'tokens';
  provider: TokenProvider;
  model: string;
  /** What the call was for: plan, draft, fix, rank, label … */
  label: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export interface GpuEntry {
  kind: 'gpu';
  provider: 'baseten';
  model: string;
  label: string;
  /** Wall-clock seconds of the request, cold start included. */
  seconds: number;
  /** The endpoint answered 503 because a replica was still starting. */
  warming: boolean;
  costUsd?: number;
}

export type UsageEntry = TokenEntry | GpuEntry;

export interface TokenTotals {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export interface GpuTotals {
  calls: number;
  seconds: number;
  warmups: number;
  costUsd?: number;
}

export interface UsageSummary {
  meta?: TokenTotals;
  fireworks?: TokenTotals;
  baseten?: GpuTotals;
  /** Baseten-hosted LLM fallback (Muse Spark Open) tokens — SAM 3 GPU time stays in `baseten`. */
  basetenLlm?: TokenTotals;
  /** Sum across providers; only present when every entry has a cost. */
  costUsd?: number;
}

/** A total is only honest when every part of it is priced. */
function sumCost(list: { costUsd?: number }[]): number | undefined {
  if (!list.length || list.some((e) => e.costUsd === undefined)) return undefined;
  return list.reduce((s, e) => s + (e.costUsd as number), 0);
}

export function summarise(entries: UsageEntry[]): UsageSummary {
  const tokens = (p: TokenProvider): TokenTotals | undefined => {
    const list = entries.filter((e): e is TokenEntry => e.kind === 'tokens' && e.provider === p);
    if (!list.length) return undefined;
    return {
      calls: list.length,
      promptTokens: list.reduce((s, e) => s + e.promptTokens, 0),
      completionTokens: list.reduce((s, e) => s + e.completionTokens, 0),
      totalTokens: list.reduce((s, e) => s + e.totalTokens, 0),
      costUsd: sumCost(list),
    };
  };

  const gpu = entries.filter((e): e is GpuEntry => e.kind === 'gpu');
  return {
    meta: tokens('meta'),
    fireworks: tokens('fireworks'),
    basetenLlm: tokens('baseten'),
    baseten: gpu.length
      ? {
          calls: gpu.length,
          seconds: gpu.reduce((s, e) => s + e.seconds, 0),
          warmups: gpu.filter((e) => e.warming).length,
          costUsd: sumCost(gpu),
        }
      : undefined,
    costUsd: sumCost(entries),
  };
}
