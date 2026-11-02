import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verdict } from '@/lib/muse';
import { overBudget } from '@/lib/budget';
import { safe } from '@/lib/route';
import { withUsage } from '@/lib/usage';

export const maxDuration = 30;

const Body = z.object({
  claim: z.string().min(10).max(6000),
  readme: z.string().max(6000).optional(),
  output: z.string().max(6000),
});

/** Muse (wonder tier): does what the notebook printed support the paper's claim? */
export const POST = safe(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });

  const blocked = await overBudget('meta');
  if (blocked) return NextResponse.json({ ok: false, error: blocked, budget: true, usage: [] }, { status: 429 });

  const { result: r, usage } = await withUsage(() => verdict(parsed.data.claim, parsed.data.readme ?? '', parsed.data.output));
  return NextResponse.json({ ...r, usage }, { status: r.ok ? 200 : r.missing ? 424 : 502 });
});
