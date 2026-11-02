/**
 * Save / load LabRun progress.
 *
 * Prefer Upstash Redis when configured (same env as budget.ts). Otherwise an
 * in-process map — fine for local MVP; production should set Redis so resume
 * survives deploys.
 */

import type { LabRun } from './types';

const TTL_SECONDS = 60 * 60 * 24 * 14;
const PREFIX = 'lab:run:';

const g = globalThis as unknown as { __labRuns?: Map<string, LabRun> };

function memory(): Map<string, LabRun> {
  return (g.__labRuns ??= new Map());
}

function redisCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

export function newRunId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveProgress(run: LabRun): Promise<void> {
  run.updatedAt = Date.now();
  memory().set(run.id, structuredClone(run));
  const redis = redisCreds();
  if (!redis) return;
  await fetch(`${redis.url}/set/${encodeURIComponent(PREFIX + run.id)}/${encodeURIComponent(JSON.stringify(run))}?EX=${TTL_SECONDS}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redis.token}` },
    cache: 'no-store',
  }).catch((e) => console.warn('[agent/progress] redis save failed', e));
}

export async function loadProgress(id: string): Promise<LabRun | null> {
  const local = memory().get(id);
  if (local) return structuredClone(local);
  const redis = redisCreds();
  if (!redis) return null;
  try {
    const res = await fetch(`${redis.url}/get/${encodeURIComponent(PREFIX + id)}`, {
      headers: { Authorization: `Bearer ${redis.token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: string | null };
    if (!body.result) return null;
    const run = JSON.parse(body.result) as LabRun;
    memory().set(id, run);
    return structuredClone(run);
  } catch (e) {
    console.warn('[agent/progress] redis load failed', e);
    return null;
  }
}
