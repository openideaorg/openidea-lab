'use client';

/**
 * Muse-only Lab Agent console — plan / act / observe + HITL + client sandbox.
 * Paid fence: Free teaser vs Lab Pro ≤ $20.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { LabRun, AgentTurnResult } from '@/lib/agent/types';
import type { GeneratedFile } from '@/lib/muse';
import { LAB_PLANS, LAB_PRO_MAX_PRICE_USD } from '@/lib/lab-plan';
import { StudioButton } from '../studio-button';
import { UsagePanel } from '../usage-panel';

async function post<T>(body: unknown): Promise<
  | { ok: true; value: T; meter?: unknown; plans?: unknown; error?: string }
  | { ok: false; error: string; missing?: string; upgrade?: boolean; meter?: unknown }
> {
  const res = await fetch('/api/lab/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!text) return { ok: false, error: `Empty response (HTTP ${res.status})` };
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: `Non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}` };
  }
}

function AgentPageInner() {
  const params = useSearchParams();
  const [kind, setKind] = useState<'idea' | 'paper' | 'photo'>('idea');
  const [input, setInput] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [planTier, setPlanTier] = useState<'free' | 'pro'>('free');
  const [run, setRun] = useState<LabRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  useEffect(() => {
    const q = params.get('q');
    if (q) setInput(q);
    const k = params.get('kind');
    if (k === 'paper' || k === 'idea' || k === 'photo') setKind(k);
  }, [params]);

  async function applyResult(r: { ok: true; value: AgentTurnResult } | { ok: false; error: string; missing?: string; upgrade?: boolean }) {
    if (!r.ok) {
      setError(r.missing ? `${r.error}. Set ${r.missing} in .env.local (from Cursor / Claude Code Muse keys).` : r.error);
      setUpgrade(!!r.upgrade);
      setBusy(false);
      return;
    }
    setRun(r.value.run);
    setError(null);
    setUpgrade(false);

    if (r.value.needsClientSandbox) {
      await runClientSandbox(r.value.run);
      return;
    }
    setBusy(false);
  }

  async function start() {
    setBusy(true);
    setError(null);
    setRun(null);
    // Photo runs carry the image on the run; the controller calls segment_photo with {}.
    const r = await post<AgentTurnResult>(
      kind === 'photo' && photo
        ? { action: 'start', kind, input, planTier, image: photo }
        : { action: 'start', kind, input, planTier },
    );
    await applyResult(r);
  }

  /** Read a hardware photo as a data URL (route cap ~3MB chars; shrink first if larger). */
  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Pick an image file (JPEG/PNG) of the hardware.');
      return;
    }
    const text = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error('Could not read the photo.'));
      fr.readAsDataURL(file);
    });
    if (text.length > 3_000_000) {
      setError(`Photo is ${(text.length / 1e6).toFixed(1)}MB; shrink it under ~2MB and try again.`);
      return;
    }
    setPhoto(text);
    setPhotoName(file.name);
    setError(null);
  }

  async function resume(patch: Record<string, unknown>) {
    if (!run) return;
    setBusy(true);
    const r = await post<AgentTurnResult>({ action: 'resume', runId: run.id, ...patch });
    await applyResult(r);
  }

  async function runClientSandbox(current: LabRun) {
    // Photo runs produce a parts list, not code — nothing to execute in a sandbox.
    if (current.kind === 'photo' || !(current.files?.length ?? 0)) {
      setBusy(false);
      return;
    }
    try {
      const runner =
        current.kind === 'idea'
          ? (await import('@/lib/runner/webcontainer')).webcontainerRunner
          : (await import('@/lib/runner/pyodide')).pyodideRunner;
      if (!runner.available()) {
        await resume({
          sandbox: { ok: false, error: `${runner.name} cannot run in this browser.` },
        });
        return;
      }
      const result = await runner.run(current.files as GeneratedFile[], () => undefined);
      await resume({
        sandbox: {
          ok: result.ok,
          output: result.output,
          error: result.ok ? undefined : result.error,
          previewUrl: result.previewUrl,
        },
      });
    } catch (e) {
      await resume({ sandbox: { ok: false, error: e instanceof Error ? e.message : String(e) } });
    }
  }

  const bibtex =
    run?.citations
      ?.map(
        (c, i) =>
          `@misc{lab${i},\n  title={${c.title.replace(/[{}]/g, '')}},\n  url={${c.url}},\n  note={Open Idea Lab}\n}`,
      )
      .join('\n\n') ?? '';

  const canExportCitations = planTier === 'pro' || run?.planTier === 'pro';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <section className="grid gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Lab Agent</h1>
        <p className="text-sm text-[var(--muted)]">
          Muse-only tool loop (plan → act → observe). Free is a teaser; Lab Pro is ≤ ${LAB_PRO_MAX_PRICE_USD}/mo.
          Keys: set <code className="text-[var(--fg)]">META_API_KEY</code> from Cursor / Claude Code Muse configuration.
        </p>

        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            Kind
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as 'idea' | 'paper' | 'photo')}
              className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1"
            >
              <option value="idea">Idea</option>
              <option value="paper">Paper</option>
              <option value="photo">Photo</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Plan
            <select
              value={planTier}
              onChange={(e) => setPlanTier(e.target.value as 'free' | 'pro')}
              className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1"
            >
              <option value="free">
                Free — {LAB_PLANS.free.labRunsPerMonth} runs
              </option>
              <option value="pro">
                Lab Pro ${LAB_PLANS.pro.priceUsd} — {LAB_PLANS.pro.labRunsPerMonth} runs
              </option>
            </select>
          </label>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={kind === 'paper' ? 12 : 5}
          placeholder={
            kind === 'paper'
              ? 'Paste paper abstract / claim…'
              : kind === 'photo'
                ? 'What hardware is in the photo? (e.g. ESP32 soil-moisture rig)'
                : 'Describe the idea to prototype…'
          }
          className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm outline-none focus:border-[var(--accent)]"
        />
        {kind === 'photo' && (
          <div className="grid gap-1 text-sm">
            <label className="flex w-fit cursor-pointer items-center gap-2 rounded border border-[var(--line)] px-3 py-1.5">
              {photoName ? `Photo: ${photoName}` : 'Attach hardware photo'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void pickPhoto(e.target.files?.[0])}
              />
            </label>
            <p className="text-xs text-[var(--muted)]">
              SAM 3 outlines each part; Muse names them. First run can take 30–90s while the GPU wakes.
            </p>
          </div>
        )}
        <button
          onClick={start}
          disabled={busy || (kind === 'photo' ? !photo : input.trim().length < 5)}
          className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          {busy ? 'Running…' : 'Start Muse agent'}
        </button>
        {error && <p className="text-sm text-red-300">{error}</p>}
        {upgrade && (
          <p className="text-sm text-amber-200">
            Upgrade to Lab Pro (≤ ${LAB_PRO_MAX_PRICE_USD}/mo) for more runs, replay, citations export, and HITL sign-off.
          </p>
        )}

        {run && (run.status === 'needs_input' || run.status === 'awaiting_signoff' || run.stopReason === 'photo_upload') && (
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
            <p className="font-medium">Human in the loop</p>
            <p className="mt-1 text-[var(--muted)]">Status: {run.status} · {run.stopReason ?? '—'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {run.stopReason === 'photo_upload' && (
                <label className="flex cursor-pointer items-center gap-2 rounded bg-[var(--accent)] px-3 py-1.5 text-black">
                  {photoName ? `Attached: ${photoName} — send` : 'Attach photo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      await pickPhoto(f);
                    }}
                  />
                </label>
              )}
              {run.stopReason === 'photo_upload' && photo && (
                <button
                  className="rounded border border-[var(--line)] px-3 py-1.5"
                  disabled={busy}
                  onClick={() => resume({ image: photo })}
                >
                  Send photo & continue
                </button>
              )}
              {run.stopReason === 'approve_plan' && (
                <button
                  className="rounded bg-[var(--accent)] px-3 py-1.5 text-black"
                  disabled={busy}
                  onClick={() => resume({ planApproved: true })}
                >
                  Approve plan
                </button>
              )}
              {(run.status === 'awaiting_signoff' || run.stopReason === 'signoff') && (
                <button
                  className="rounded bg-[var(--accent)] px-3 py-1.5 text-black"
                  disabled={busy}
                  onClick={() => resume({ signedOff: true })}
                >
                  Sign off
                </button>
              )}
              <button
                className="rounded border border-[var(--line)] px-3 py-1.5"
                disabled={busy}
                onClick={() => resume({ humanNote: 'Continue with my notes: proceed carefully.' })}
              >
                Resume with note
              </button>
            </div>
          </div>
        )}

        {run?.plan && (
          <div className="rounded-md border border-[var(--line)] p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">Plan</h2>
            <p className="mt-1">{run.plan.summary}</p>
            <p className="mt-1 text-[var(--muted)]">Buildable: {run.plan.buildable ? 'yes' : 'not yet'}</p>
          </div>
        )}

        {run?.partsMarkdown ? (
          <div className="rounded-md border border-[var(--line)] p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Parts list{run.parts?.length ? ` (${run.parts.length})` : ''}
            </h2>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs">{run.partsMarkdown}</pre>
          </div>
        ) : null}

        {run?.files?.length ? (
          <div className="grid gap-2">
            <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">Files</h2>
            {run.files.map((f) => (
              <details key={f.path} className="rounded border border-[var(--line)] bg-[var(--surface)] p-2 text-sm">
                <summary className="cursor-pointer font-mono text-xs">{f.path}</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{f.content}</pre>
              </details>
            ))}
            {run.status === 'done' || run.stopReason === 'submitted' || run.status === 'awaiting_signoff' ? (
              <StudioButton
                title={run.input.slice(0, 70)}
                idea={run.input}
                summary={run.plan?.summary}
                files={run.files}
                runId={run.id}
              />
            ) : null}
          </div>
        ) : null}

        {run?.citations?.length ? (
          <div className="rounded-md border border-[var(--line)] p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">Citations</h2>
            <ul className="mt-2 grid gap-1">
              {run.citations.map((c) => (
                <li key={c.url}>
                  <a className="underline" href={c.url} target="_blank" rel="noreferrer">
                    {c.title}
                  </a>
                </li>
              ))}
            </ul>
            {canExportCitations ? (
              <button
                className="mt-2 rounded border border-[var(--line)] px-2 py-1 text-xs"
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
            ) : (
              <p className="mt-2 text-xs text-amber-200">Full BibTeX export is a Lab Pro feature (≤ ${LAB_PRO_MAX_PRICE_USD}).</p>
            )}
          </div>
        ) : null}

        {run?.usage?.length ? <UsagePanel entries={run.usage} /> : null}
      </section>

      <section className="grid gap-2">
        <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">Agent console</h2>
        <div className="min-h-[28rem] rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-xs">
          {!run && <p className="text-[var(--muted)]">Start a run to see plan / act / observe.</p>}
          {run && (
            <p className="mb-2 text-[var(--muted)]">
              run {run.id} · turn {run.turn} · {run.status}
              {run.verdict ? ` · verdict ${run.verdict.verdict}` : ''}
              {run.scale ? <span id="agent-scale" className="block">scale (this run vs paper) · {run.scale}</span> : null}
            </p>
          )}
          <ol className="grid gap-2">
            {(run?.console ?? []).map((row, i) => (
              <li key={`${row.at}-${i}`} className="border-l-2 border-[var(--line)] pl-2">
                <span className="text-[var(--accent)]">{row.phase}</span>
                {row.tool ? <span className="text-[var(--muted)]"> · {row.tool}</span> : null}
                <pre className="mt-0.5 whitespace-pre-wrap break-words text-[var(--fg)]">{row.text}</pre>
              </li>
            ))}
          </ol>
        </div>
        {run?.sandbox?.previewUrl && (
          <iframe title="preview" src={run.sandbox.previewUrl} className="h-80 w-full rounded border border-[var(--line)]" />
        )}
      </section>
    </div>
  );
}

export default function AgentPage() {
  return (
    <Suspense fallback={null}>
      <AgentPageInner />
    </Suspense>
  );
}
