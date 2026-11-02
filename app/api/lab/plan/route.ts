import { NextResponse } from 'next/server';
import { z } from 'zod';
import { draftNotebook, draftPrototype, planIdea } from '@/lib/muse';
import { overBudget } from '@/lib/budget';
import { safe } from '@/lib/route';
import { withUsage } from '@/lib/usage';

export const maxDuration = 60;

const Resource = z.object({
  id: z.string(),
  type: z.enum(['paper', 'dataset', 'code', 'model', 'hardware', 'video']),
  title: z.string(),
  url: z.string(),
  description: z.string().optional(),
});

const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('idea'), idea: z.string().min(5).max(5000), context: z.array(Resource), graph: z.string().max(4000).optional() }),
  z.object({ kind: z.literal('paper'), text: z.string().min(50), context: z.array(Resource) }),
]);

/**
 * Muse: plan an idea and draft its prototype, or draft a paper reproduction.
 *
 * Paper responses include the extracted `claim` — the paper-ingest handoff.
 * The client uses it for the verdict step instead of the raw pasted text, so
 * the judgement targets the one sentence the notebook actually tested.
 */
export const POST = safe(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  const body = parsed.data;

  const blocked = await overBudget('meta');
  if (blocked) return NextResponse.json({ ok: false, error: blocked, budget: true, usage: [] }, { status: 429 });

  const { result, usage } = await withUsage(async () => {
    if (body.kind === 'idea') {
      const plan = await planIdea(body.idea, body.context, body.graph);
      if (!plan.ok) return { out: plan, status: plan.missing ? 424 : 502 };
      const files = await draftPrototype(body.idea, plan.value);
      if (!files.ok) return { out: files, status: 502 };
      return { out: { ok: true as const, value: { plan: plan.value, files: files.value } }, status: 200 };
    }
    // Paper ingest: the draft returns the testable claim alongside the files.
    const drafted = await draftNotebook(body.text, body.context);
    if (!drafted.ok) return { out: drafted, status: drafted.missing ? 424 : 502 };
    return { out: { ok: true as const, value: { files: drafted.value.files, claim: drafted.value.claim } }, status: 200 };
  });

  return NextResponse.json({ ...result.out, usage }, { status: result.status });
});
