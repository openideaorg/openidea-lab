import { NextResponse } from 'next/server';
import { z } from 'zod';
import { segment } from '@/lib/baseten-sam3';
import { enrichParts, labelParts } from '@/lib/muse';
import { search } from '@/lib/openidea';
import { overBudget } from '@/lib/budget';
import { safe } from '@/lib/route';
import { withUsage } from '@/lib/usage';

// A cold SAM 3 replica can take a while to answer; the client retries on "warming".
export const maxDuration = 60;

const Body = z
  .object({
    /** data:image/...;base64,... of the whole photo. Only needed to segment. */
    image: z.string().startsWith('data:image/').optional(),
    /** Crops of each segment, produced client-side from the masks; sent on the second call. */
    crops: z.array(z.string().startsWith('data:image/')).optional(),
  })
  .refine((b) => b.image || b.crops, { message: 'Bad request' });

// Vision labelling is priced per image: a busy photo can segment into dozens of
// parts, so labelling all of them would cost several times a whole idea run.
// The model serves segments biggest-and-most-confident first, so the first 12
// are the parts list that matters for the demo.
const MAX_PARTS = 12;

/**
 * Photo flow in two calls. First call: SAM 3 segments the image (may answer
 * `warming`). Second call, with crops: Muse (contributor tier) labels each
 * part, OpenIdea finds datasheets and listings, Muse (contributor tier)
 * writes the parts list.
 */
export const POST = safe(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  const { image, crops } = parsed.data;

  const blocked = crops ? await overBudget('meta') : await overBudget('baseten');
  if (blocked) return NextResponse.json({ ok: false, error: blocked, budget: true, usage: [] }, { status: 429 });

  const { result, usage } = await withUsage(async () => {
    if (!crops) {
      if (!image) return { out: { ok: false as const, error: 'Bad request' }, status: 400 };
      const r = await segment(image);
      return { out: r, status: r.ok ? 200 : r.missing ? 424 : 502 };
    }

    const labelled = await labelParts(crops.slice(0, MAX_PARTS));
    if (!labelled.ok) return { out: labelled, status: labelled.missing ? 424 : 502 };
    const names = labelled.value.map((p) => p.name);

    const found = await search(names.slice(0, 5).join(' '), { types: ['hardware', 'code'], limit: 10 });
    const context = found.ok ? found.value : [];

    const list = await enrichParts(names, context);
    if (!list.ok) return { out: list, status: list.missing ? 424 : 502 };

    return { out: { ok: true as const, value: { parts: labelled.value, markdown: list.value, context } }, status: 200 };
  });

  return NextResponse.json({ ...result.out, usage }, { status: result.status });
});
