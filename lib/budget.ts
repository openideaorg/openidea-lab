/**
 * Credit budget: what the providers have been used for, against the credit you
 * were given, with a stop before it runs out.
 *
 * Every finished request (see withUsage in usage.ts) adds its calls, tokens, GPU
 * seconds and estimated cost to counters. A route asks `overBudget` before it
 * spends and answers 429 when the provider is at its stop point.
 *
 * Storage is Upstash Redis over REST (UPSTASH_REDIS_REST_URL / _TOKEN, or the
 * KV_REST_API_URL / _TOKEN pair Vercel's Upstash integration sets). Without it
 * the counters live in this process only: fine for local work, but on Vercel each
 * instance has its own and they reset on deploy, so the cap is NOT reliable there.
 *
 * Settings (all optional):
 *   META_CREDIT_USD, FIREWORKS_CREDIT_USD, BASETEN_CREDIT_USD   credit you were given
 *   LAB_BUDGET_STOP_PCT                                         stop at this % (default 90)
 * Cost needs the *_PRICE_* variables from usage.ts; without them spend reads as 0,
 * so the cap cannot trigger. The dashboard says so.
 */

import type { UsageEntry } from './usage-types';

export type BudgetProvider = 'meta' | 'fireworks' | 'baseten';
export const BUDGET_PROVIDERS: BudgetProvider[] = ['meta', 'fireworks', 'baseten'];

export const PROVIDER_LABEL: Record<BudgetProvider, string> = {
  meta: 'Meta · Muse',
  fireworks: 'Fireworks',
  baseten: 'Baseten · SAM 3',
};

export interface Counters {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  seconds: number;
  costUsd: number;
  /** Calls made while no price was set, so their cost is missing from costUsd. */
  unpriced: number;
}

const ZERO: Counters = { calls: 0, promptTokens: 0, completionTokens: 0, seconds: 0, costUsd: 0, unpriced: 0 };
const DAY_TTL_SECONDS = 60 * 60 * 24 * 100;

// ---------------------------------------------------------------- storage

interface Store {
  kind: 'redis' | 'memory';
  add(key: string, fields: Record<string, number>, ttlSeconds?: number): Promise<void>;
  read(key: string): Promise<Record<string, number>>;
}

const g = globalThis as unknown as { __labBudget?: Map<string, Record<string, number>> };

const memoryStore: Store = {
  kind: 'memory',
  async add(key, fields) {
    const map = (g.__labBudget ??= new Map());
    const row = map.get(key) ?? {};
    for (const [f, v] of Object.entries(fields)) row[f] = (row[f] ?? 0) + v;
    map.set(key, row);
  },
  async read(key) {
    return { ...(g.__labBudget?.get(key) ?? {}) };
  },
};

function redisStore(url: string, token: string): Store {
  const run = async (commands: string[][]) => {
    const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Redis ${res.status}`);
    return (await res.json()) as { result?: unknown; error?: string }[];
  };
  return {
    kind: 'redis',
    async add(key, fields, ttlSeconds) {
      const commands = Object.entries(fields)
        .filter(([, v]) => v !== 0)
        .map(([f, v]) => ['HINCRBYFLOAT', key, f, String(v)]);
      if (!commands.length) return;
      if (ttlSeconds) commands.push(['EXPIRE', key, String(ttlSeconds)]);
      await run(commands);
    },
    async read(key) {
      const [r] = await run([['HGETALL', key]]);
      const flat = (r?.result ?? []) as string[];
      const out: Record<string, number> = {};
      for (let i = 0; i < flat.length; i += 2) out[flat[i]] = Number(flat[i + 1]);
      return out;
    },
  };
}

export function getStore(): Store {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? redisStore(url, token) : memoryStore;
}

/** Test helper: forget everything held in memory. */
export function resetMemoryStore(): void {
  g.__labBudget = new Map();
}

// ---------------------------------------------------------------- recording

const day = (d = new Date()) => d.toISOString().slice(0, 10);
const totalKey = (p: BudgetProvider) => `lab:total:${p}`;
const dayKey = (p: BudgetProvider, d: string) => `lab:day:${p}:${d}`;

function fieldsFor(e: UsageEntry): Record<string, number> {
  const base = { calls: 1, costUsd: e.costUsd ?? 0, unpriced: e.costUsd === undefined ? 1 : 0 };
  return e.kind === 'tokens'
    ? { ...base, promptTokens: e.promptTokens, completionTokens: e.completionTokens }
    : { ...base, seconds: e.seconds };
}

/** Add one request's entries to the totals and to today's counters. */
export async function persistSpend(entries: UsageEntry[]): Promise<void> {
  if (!entries.length) return;
  const store = getStore();
  const today = day();
  const byProvider = new Map<BudgetProvider, Record<string, number>>();
  for (const e of entries) {
    const sum = byProvider.get(e.provider) ?? {};
    for (const [f, v] of Object.entries(fieldsFor(e))) sum[f] = (sum[f] ?? 0) + v;
    byProvider.set(e.provider, sum);
  }
  await Promise.all(
    [...byProvider].flatMap(([p, fields]) => [store.add(totalKey(p), fields), store.add(dayKey(p, today), fields, DAY_TTL_SECONDS)]),
  );
}

// ---------------------------------------------------------------- reading

const num = (name: string): number | undefined => {
  const raw = process.env[name];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export const creditUsd = (p: BudgetProvider) => num(`${p.toUpperCase()}_CREDIT_USD`);
export const stopPct = () => Math.min(100, Math.max(1, num('LAB_BUDGET_STOP_PCT') ?? 90));

const toCounters = (row: Record<string, number>): Counters => ({ ...ZERO, ...row });

export interface ProviderBudget {
  provider: BudgetProvider;
  label: string;
  creditUsd?: number;
  /** Spend at which new runs are refused. */
  stopAtUsd?: number;
  totals: Counters;
  /** Share of the credit spent, 0–100+. */
  pct?: number;
  remainingUsd?: number;
  /** Rough number of further calls at the average cost so far. */
  callsLeft?: number;
  blocked: boolean;
  days: { day: string; costUsd: number; calls: number }[];
}

export interface BudgetSummary {
  store: 'redis' | 'memory';
  stopPct: number;
  providers: ProviderBudget[];
  totalCostUsd: number;
  unpricedCalls: number;
}

export async function budgetSummary(days = 7): Promise<BudgetSummary> {
  const store = getStore();
  const dates = Array.from({ length: days }, (_, i) => day(new Date(Date.now() - i * 86_400_000)));
  const stop = stopPct();

  const providers = await Promise.all(
    BUDGET_PROVIDERS.map(async (provider): Promise<ProviderBudget> => {
      const [total, ...perDay] = await Promise.all([store.read(totalKey(provider)), ...dates.map((d) => store.read(dayKey(provider, d)))]);
      const totals = toCounters(total);
      const credit = creditUsd(provider);
      const stopAtUsd = credit !== undefined ? (credit * stop) / 100 : undefined;
      const avg = totals.calls > 0 ? totals.costUsd / totals.calls : 0;
      const remainingUsd = credit !== undefined ? Math.max(0, credit - totals.costUsd) : undefined;
      return {
        provider,
        label: PROVIDER_LABEL[provider],
        creditUsd: credit,
        stopAtUsd,
        totals,
        pct: credit ? (totals.costUsd / credit) * 100 : undefined,
        remainingUsd,
        callsLeft: remainingUsd !== undefined && avg > 0 ? Math.floor(remainingUsd / avg) : undefined,
        blocked: stopAtUsd !== undefined && totals.costUsd >= stopAtUsd,
        days: dates.map((d, i) => ({ day: d, costUsd: perDay[i].costUsd ?? 0, calls: perDay[i].calls ?? 0 })),
      };
    }),
  );

  return {
    store: store.kind,
    stopPct: stop,
    providers,
    totalCostUsd: providers.reduce((s, p) => s + p.totals.costUsd, 0),
    unpricedCalls: providers.reduce((s, p) => s + p.totals.unpriced, 0),
  };
}

/**
 * A message when this provider is at its stop point, otherwise null. A storage
 * failure returns null: a Redis hiccup should not take the whole app down, and
 * the dashboard shows when the store is unreachable.
 */
export async function overBudget(provider: BudgetProvider): Promise<string | null> {
  const credit = creditUsd(provider);
  if (credit === undefined) return null;
  try {
    const spent = toCounters(await getStore().read(totalKey(provider))).costUsd;
    const stopAt = (credit * stopPct()) / 100;
    if (spent < stopAt) return null;
    return `${PROVIDER_LABEL[provider]} credit is nearly used up (about $${spent.toFixed(2)} of $${credit.toFixed(2)}). New runs are paused to protect it.`;
  } catch (e) {
    console.warn('[budget] could not read spend; allowing the request', e);
    return null;
  }
}
