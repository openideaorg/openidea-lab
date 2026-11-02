'use client';

/**
 * Paid Transformer end-state walkthrough — fixture demo for judges / screenshots.
 * Query: ?step=paste|console|approve|sandbox|bibtex|paid
 */

import Link from 'next/link';
import { useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  DEMO_STEPS,
  PAPER_BLURB,
  STEP_NARRATION,
  bibtexFrom,
  fixtureRun,
  type DemoStepId,
} from '@/lib/demo/paid-transformer-fixture';
import { LAB_PLANS, LAB_PRO_MAX_PRICE_USD } from '@/lib/lab-plan';
import { UsagePanel } from '../../usage-panel';

function isStep(s: string | null): s is DemoStepId {
  return !!s && DEMO_STEPS.some((d) => d.id === s);
}

function PaidDemoInner() {
  const params = useSearchParams();
  const raw = params.get('step');
  const initial: DemoStepId = isStep(raw) ? raw : 'paid';
  const [step, setStep] = useState<DemoStepId>(initial);
  const run = useMemo(() => fixtureRun(step), [step]);
  const bibtex = bibtexFrom(run.citations);
  const stepIndex = DEMO_STEPS.findIndex((d) => d.id === step);
  const isPro = run.planTier === 'pro';

  return (
    <div className="grid gap-5" data-demo-step={step} data-demo="paid-transformer">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Paid product demo</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Transformer → Lab Pro end-state
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Muse-only agent loop. Outcome a common buyer would pay ≤ ${LAB_PRO_MAX_PRICE_USD}/mo for:
            cited attention toy, console replay, sign-off, Studio handoff.
          </p>
        </div>
        <div className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-sm">
          <span className="font-medium text-[var(--accent)]">Lab Pro</span>
          <span className="text-[var(--muted)]"> · ${LAB_PLANS.pro.priceUsd}/mo · capped ≤ ${LAB_PRO_MAX_PRICE_USD}</span>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Demo steps">
        {DEMO_STEPS.map((d, i) => {
          const active = d.id === step;
          const done = i < stepIndex;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setStep(d.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'bg-[var(--accent)] text-black'
                  : done
                    ? 'border border-[var(--accent)]/50 text-[var(--accent)]'
                    : 'border border-[var(--line)] text-[var(--muted)] hover:text-[var(--fg)]'
              }`}
            >
              {d.label}
            </button>
          );
        })}
      </nav>

      <p className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
        {STEP_NARRATION[step]}
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Lab Agent</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                isPro ? 'bg-[var(--accent)] text-black' : 'border border-[var(--line)] text-[var(--muted)]'
              }`}
            >
              {isPro ? `Plan · Lab Pro $${LAB_PLANS.pro.priceUsd}` : 'Plan · Free teaser'}
            </span>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Muse-only tool loop (plan → act → observe). Free is a teaser; Lab Pro is ≤ ${LAB_PRO_MAX_PRICE_USD}/mo.
          </p>

          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1">Kind · Paper</span>
            <span className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1">
              {isPro
                ? `Lab Pro $${LAB_PLANS.pro.priceUsd} — ${LAB_PLANS.pro.labRunsPerMonth} runs`
                : `Free — ${LAB_PLANS.free.labRunsPerMonth} runs`}
            </span>
          </div>

          {/* Late steps: money shots first (above the fold for screenshots / buyers). */}
          {step === 'paid' && (
            <div
              className="rounded-md border border-[var(--accent)] bg-[var(--accent)]/10 p-4 text-sm"
              data-demo-panel="signoff"
            >
              <p className="text-base font-semibold text-[var(--accent)]">Signed off · paid end</p>
              <p className="mt-1 text-[var(--fg)]">
                Saved Lab Pro run with console replay, BibTeX, verdict, and Studio handoff.
              </p>
              <ul className="mt-3 grid gap-1 text-[var(--muted)]">
                <li>✓ Muse console (plan / act / observe) durable</li>
                <li>✓ Citations + BibTeX export</li>
                <li>✓ Researcher sign-off recorded</li>
                <li>✓ Lab Pro ${LAB_PLANS.pro.priceUsd}/mo (≤ ${LAB_PRO_MAX_PRICE_USD} hard cap)</li>
                <li>✓ Muse spend this run ~$0.41 of Pro envelope</li>
              </ul>
              <div className="mt-3 rounded border border-[var(--accent)]/40 bg-[var(--bg)]/40 px-3 py-2 text-xs">
                Receipt · Attention Is All You Need → <code className="text-[var(--accent)]">attention_toy.py</code> · Pro $
                {LAB_PLANS.pro.priceUsd}/mo
              </div>
            </div>
          )}

          {(step === 'bibtex' || step === 'paid') && run.citations.length > 0 && (
            <div className="rounded-md border border-[var(--accent)]/40 bg-[var(--surface)] p-3 text-sm" data-demo-panel="citations">
              <h3 className="text-xs uppercase tracking-wide text-[var(--accent)]">Citations · Pro BibTeX</h3>
              <ul className="mt-2 grid gap-1">
                {run.citations.map((c) => (
                  <li key={c.url}>
                    <a className="underline" href={c.url} target="_blank" rel="noreferrer">
                      {c.title}
                    </a>
                  </li>
                ))}
              </ul>
              <pre className="mt-3 max-h-28 overflow-auto rounded border border-[var(--line)] bg-[var(--bg)] p-2 text-[11px] text-[var(--muted)]">
                {bibtex}
              </pre>
              <button
                type="button"
                className="mt-2 rounded border border-[var(--accent)]/50 px-2 py-1 text-xs text-[var(--accent)]"
                onClick={() => {
                  const blob = new Blob([bibtex], { type: 'text/plain' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = 'lab-citations.bib';
                  a.click();
                }}
              >
                Download BibTeX
              </button>
            </div>
          )}

          {step === 'bibtex' && (
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
              <p className="font-medium">Human in the loop · sign-off</p>
              <p className="mt-1 text-[var(--muted)]">
                Verdict: {run.verdict?.verdict} — {run.verdict?.reason}
              </p>
              <button
                type="button"
                className="mt-3 rounded bg-[var(--accent)] px-3 py-1.5 text-black"
                onClick={() => setStep('paid')}
              >
                Sign off
              </button>
            </div>
          )}

          {(step === 'sandbox' || step === 'bibtex' || step === 'paid') && run.sandbox?.ok && (
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-xs">
              <h3 className="mb-2 text-xs uppercase tracking-wide text-[var(--muted)]">Sandbox · attention matrix</h3>
              <pre className="max-h-36 overflow-auto whitespace-pre-wrap text-[var(--fg)]">{run.sandbox.output}</pre>
            </div>
          )}

          {run.files.length > 0 && (
            <div className="grid gap-2">
              <h3 className="text-xs uppercase tracking-wide text-[var(--muted)]">Files</h3>
              {run.files.map((f) => (
                <details
                  key={f.path}
                  open={step === 'sandbox'}
                  className="rounded border border-[var(--line)] bg-[var(--surface)] p-2 text-sm"
                >
                  <summary className="cursor-pointer font-mono text-xs">{f.path}</summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">{f.content}</pre>
                </details>
              ))}
              {(step === 'bibtex' || step === 'paid') && (
                <div className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2 text-sm">
                  Open in Studio — files handoff ready (Lab Pro)
                </div>
              )}
            </div>
          )}

          {/* Early steps keep the full paper paste; late steps collapse to a one-liner. */}
          {step === 'paste' || step === 'console' || step === 'approve' ? (
            <textarea
              readOnly
              value={PAPER_BLURB}
              rows={step === 'paste' ? 10 : 5}
              className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm"
            />
          ) : (
            <p className="rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">
              Paper · Attention Is All You Need · arXiv:1706.03762 · Lab Pro run demo-attn-pro-001
            </p>
          )}

          {step === 'paste' && (
            <button
              type="button"
              className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black"
              onClick={() => setStep('console')}
            >
              Start Muse agent
            </button>
          )}

          {step === 'approve' && (
            <div className="rounded-md border border-[var(--accent)]/40 bg-[var(--surface)] p-3 text-sm">
              <p className="font-medium">Human in the loop</p>
              <p className="mt-1 text-[var(--muted)]">Status: needs_input · approve_plan</p>
              <button
                type="button"
                className="mt-3 rounded bg-[var(--accent)] px-3 py-1.5 text-black"
                onClick={() => setStep('sandbox')}
              >
                Approve plan
              </button>
            </div>
          )}

          {run.plan && step !== 'paid' && (
            <div className="rounded-md border border-[var(--line)] p-3 text-sm">
              <h3 className="text-xs uppercase tracking-wide text-[var(--muted)]">Plan</h3>
              <p className="mt-1">{run.plan.summary}</p>
              <p className="mt-1 text-[var(--muted)]">Buildable: yes</p>
              {(step === 'console' || step === 'approve' || step === 'sandbox') && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[var(--muted)]">
                  {run.plan.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {run.usage.length > 0 && step !== 'paste' && step !== 'paid' ? <UsagePanel entries={run.usage} /> : null}
          {step === 'paid' && run.usage.length > 0 ? (
            <p className="text-xs text-[var(--muted)]">
              Usage this run · Meta Muse · 2 calls · ~$0.41 (under Lab Pro ${LAB_PLANS.pro.priceUsd} envelope)
            </p>
          ) : null}
        </section>

        <section className="grid gap-2">
          <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">Agent console</h2>
          <div
            className={`rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-xs ${
              step === 'paid' || step === 'bibtex' ? 'min-h-[22rem] max-h-[32rem] overflow-auto' : 'min-h-[28rem]'
            }`}
            data-demo-panel="console"
          >
            {!run.console.length && (
              <p className="text-[var(--muted)]">Start a run to see plan / act / observe.</p>
            )}
            {run.console.length > 0 && (
              <p className="mb-2 text-[var(--muted)]">
                run {run.id} · turn {run.turn} · {run.status}
                {run.verdict ? ` · verdict ${run.verdict.verdict}` : ''}
                {isPro ? ' · Lab Pro' : ''}
              </p>
            )}
            <ol className="grid gap-2">
              {run.console.map((row, i) => (
                <li key={`${row.at}-${i}`} className="border-l-2 border-[var(--accent)]/40 pl-2">
                  <span className="text-[var(--accent)]">{row.phase}</span>
                  {row.tool ? <span className="text-[var(--muted)]"> · {row.tool}</span> : null}
                  <pre className="mt-0.5 whitespace-pre-wrap break-words text-[var(--fg)]">{row.text}</pre>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>

      <p className="text-xs text-[var(--muted)]">
        Demo fixture · Attention Is All You Need (arXiv:1706.03762) → tiny educational attention toy · Muse-only Lab
        Agent · Free vs Lab Pro ≤ ${LAB_PRO_MAX_PRICE_USD} · Fake/demo data (no META_API_KEY required for this page).{' '}
        <Link className="underline" href="/agent">
          Live /agent
        </Link>
      </p>
    </div>
  );
}

export default function PaidDemoPage() {
  return (
    <Suspense fallback={null}>
      <PaidDemoInner />
    </Suspense>
  );
}
