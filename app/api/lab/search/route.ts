import { NextResponse } from 'next/server';
import { z } from 'zod';
import { search } from '@/lib/openidea';
import { rank } from '@/lib/muse';
import { overBudget } from '@/lib/budget';
import { safe } from '@/lib/route';
import { withUsage } from '@/lib/usage';

export const maxDuration = 60;

const Body = z.object({
  query: z.string().min(2).max(2000),
  types: z.array(z.enum(['paper', 'dataset', 'code', 'model', 'hardware', 'video'])).optional(),
  keep: z.number().int().min(1).max(20).optional(),
});

/** Search the platform, then let Muse (contributor tier) keep what matters. */
export const POST = safe(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  const { query, types, keep } = parsed.data;
  const keepN = keep ?? 6;

  const found = await search(query, { types, limit: 20 });
  if (!found.ok) return NextResponse.json(found, { status: found.missing ? 424 : 502 });

  // Ranking is a nicety: when Meta is at its budget, keep the platform's order instead of failing.
  if (await overBudget('meta')) return NextResponse.json({ ok: true, value: found.value.slice(0, keepN), usage: [] });

  const { result: ranked, usage } = await withUsage(() => rank(query, found.value, keepN));
  return NextResponse.json({ ok: true, value: ranked.ok ? ranked.value : found.value.slice(0, keepN), usage });
});
