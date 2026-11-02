import { NextResponse } from 'next/server';
import { z } from 'zod';
import { openInStudio } from '@/lib/handoff';
import { safe } from '@/lib/route';

export const maxDuration = 30;

const Body = z.object({
  title: z.string().min(1).max(120),
  idea: z.string().min(1).max(5000),
  summary: z.string().max(4000).optional(),
  buildable: z.boolean().optional(),
  exists: z.array(z.string().max(300)).max(12).optional(),
  missing: z.array(z.string().max(300)).max(12).optional(),
  steps: z.array(z.string().max(300)).max(8).optional(),
  files: z.array(z.object({ path: z.string().max(120), content: z.string().max(60_000) })).max(40),
  /** Paper runs: the tested claim, verdict line and sign-off travel in the description. */
  claim: z.string().max(2000).optional(),
  verdictLine: z.string().max(600).optional(),
  signoffLine: z.string().max(300).optional(),
  /** History id of the Lab run; carried into the description as a link back. */
  labRunId: z.string().max(40).optional(),
  /** The visitor's own openidea.world API key; forwarded once, never stored. */
  apiKey: z.string().min(8).max(200),
});

/**
 * Create an App Studio project on openidea.world from a Lab prototype.
 * The plan travels in the description (steps, what exists/missing) so
 * Studio's first build starts from Lab's research, not a blank page.
 */
export const POST = safe(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Bad request: check the title, idea and file sizes.' }, { status: 400 });
  const { title, idea, summary, buildable, exists, missing, steps, files, labRunId, claim, verdictLine, signoffLine, apiKey } = parsed.data;
  const total = files.reduce((s, f) => s + f.content.length, 0);
  // The platform may cap description/files; fail fast with a plain message
  // instead of a 502 the user cannot act on.
  if (total > 400_000) {
    return NextResponse.json({ ok: false, error: `Prototype is too large for Studio handoff (${Math.round(total / 1000)} KB). Remove generated files and try again.` }, { status: 400 });
  }
  const r = await openInStudio({ title, idea, summary, buildable, exists, missing, steps, files, labRunId, claim, verdictLine, signoffLine }, apiKey);
  return NextResponse.json(r, { status: r.ok ? 200 : r.status ?? 502 });
}, { spends: false });
