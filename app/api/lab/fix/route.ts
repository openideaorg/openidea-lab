import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fix } from '@/lib/muse';
import { overBudget } from '@/lib/budget';
import { safe } from '@/lib/route';
import { withUsage } from '@/lib/usage';

export const maxDuration = 60;

const Body = z.object({
  files: z.array(z.object({ path: z.string(), content: z.string() })).min(1),
  error: z.string().min(1).max(8000),
  /** Which fix attempt this is (1-based); the prompt asks for a different change on retries. */
  attempt: z.number().int().min(1).max(10).optional(),
  /** Observe step: fingerprints + headlines of earlier errors this run. */
  history: z
    .array(z.object({ fingerprint: z.string().max(300), headline: z.string().max(300) }))
    .max(10)
    .optional(),
});

/** Muse (contributor tier): patch the files so the sandbox error goes away. */
export const POST = safe(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });

  const blocked = await overBudget('meta');
  if (blocked) return NextResponse.json({ ok: false, error: blocked, budget: true, usage: [] }, { status: 429 });

  const { result: r, usage } = await withUsage(() =>
    fix(parsed.data.files, parsed.data.error, parsed.data.attempt ?? 1, parsed.data.history ?? []),
  );
  return NextResponse.json({ ...r, usage }, { status: r.ok ? 200 : r.missing ? 424 : 502 });
});
