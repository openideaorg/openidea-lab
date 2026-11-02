import { NextResponse } from 'next/server';
import { z } from 'zod';
import { safe } from '@/lib/route';
import { overBudget } from '@/lib/budget';
import { getLabPlan, LAB_PLANS, LAB_PRO_MAX_PRICE_USD } from '@/lib/lab-plan';
import { createRun, getRun, resumeRun, runAgent } from '@/lib/agent/loop';
import { takeLabRunSlot } from '@/lib/agent/meter';
import { keyFor } from '@/lib/env';

export const maxDuration = 120;

const Start = z.object({
  action: z.literal('start'),
  kind: z.enum(['idea', 'paper']),
  input: z.string().min(5).max(60_000),
  planTier: z.enum(['free', 'pro']).optional(),
});

const Resume = z.object({
  action: z.literal('resume'),
  runId: z.string().min(4),
  planApproved: z.boolean().optional(),
  signedOff: z.boolean().optional(),
  humanNote: z.string().max(4000).optional(),
  sandbox: z
    .object({
      ok: z.boolean(),
      output: z.string().max(50_000).optional(),
      error: z.string().max(20_000).optional(),
      previewUrl: z.string().max(2000).optional(),
    })
    .optional(),
});

const Get = z.object({
  action: z.literal('get'),
  runId: z.string().min(4),
});

const Body = z.discriminatedUnion('action', [Start, Resume, Get]);

/**
 * Muse-only Lab agent API.
 *
 * Requires META_API_KEY (Meta Model API / Muse Spark). Operators obtain the
 * key from Cursor / Claude Code Muse configuration ("Configure Claude Code" /
 * Cursor-configured Muse API keys) and set it as META_API_KEY — Lab never
 * invents keys.
 */
export const POST = safe(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  const body = parsed.data;

  if (body.action === 'get') {
    const run = await getRun(body.runId);
    if (!run) return NextResponse.json({ ok: false, error: 'Unknown run' }, { status: 404 });
    return NextResponse.json({ ok: true, value: run, plans: LAB_PLANS, maxPriceUsd: LAB_PRO_MAX_PRICE_USD });
  }

  if (!keyFor('meta')) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Muse is not configured. Set META_API_KEY from your Cursor / Claude Code Muse API key.',
        missing: 'META_API_KEY',
      },
      { status: 424 },
    );
  }

  if (body.action === 'start') {
    const tier = body.planTier ?? getLabPlan().tier;
    const meter = await takeLabRunSlot(tier);
    if (!meter.ok) {
      return NextResponse.json({ ok: false, error: meter.error, meter, upgrade: meter.upgrade, plans: LAB_PLANS }, { status: 402 });
    }

    const blocked = await overBudget('meta');
    if (blocked) return NextResponse.json({ ok: false, error: blocked, budget: true }, { status: 429 });

    const run = createRun({ kind: body.kind, input: body.input, planTier: tier });
    const result = await runAgent(run);
    return NextResponse.json({
      ok: true,
      value: result,
      meter,
      plans: LAB_PLANS,
      maxPriceUsd: LAB_PRO_MAX_PRICE_USD,
      model: process.env.META_MODEL || 'muse-spark-1.3',
    });
  }

  try {
    const result = await resumeRun(body.runId, {
      planApproved: body.planApproved,
      signedOff: body.signedOff,
      humanNote: body.humanNote,
      sandbox: body.sandbox,
    });
    return NextResponse.json({ ok: true, value: result, plans: LAB_PLANS, maxPriceUsd: LAB_PRO_MAX_PRICE_USD });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 404 });
  }
});
