import type { LabVerdict } from '../types';

export type ClaimsCheck = { ok: true; verdict: LabVerdict } | { ok: false; feedback: string };

/** Light local sanity before accepting a Muse verdict JSON. */
export function checkClaimsShape(raw: unknown): ClaimsCheck {
  if (!raw || typeof raw !== 'object') return { ok: false, feedback: 'Verdict must be a JSON object.' };
  const v = raw as Record<string, unknown>;
  if (!['matches', 'partial', 'no'].includes(String(v.verdict))) {
    return { ok: false, feedback: 'verdict must be matches | partial | no.' };
  }
  if (typeof v.reason !== 'string' || !v.reason.trim()) {
    return { ok: false, feedback: 'verdict reason must be a non-empty string.' };
  }
  // Pass through the judge's "what would raise this" note (capped like lib/muse.ts parseVerdict) so the UI can render it.
  const missing = typeof v.missing === 'string' && v.missing.trim() ? v.missing.trim().slice(0, 300) : undefined;
  return { ok: true, verdict: { verdict: v.verdict as LabVerdict['verdict'], reason: v.reason, ...(missing ? { missing } : {}) } };
}
