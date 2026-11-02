'use client';

/**
 * The idea and paper flows share one shape: search → Muse drafts →
 * browser sandbox runs → Muse fixes → repeat up to MAX_FIXES → hand off.
 * Only the runner and the prompt differ, so this is one component.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { FixAttempt, Plan, GeneratedFile } from '@/lib/muse';
import type { Verdict } from '@/lib/muse';
import type { Resource } from '@/lib/openidea';
import type { RunResult } from '@/lib/runner/types';
import { describeGraph, type Subgraph } from '@/lib/graph';
import type { UsageEntry } from '@/lib/usage-types';
import { errorFingerprint, tail } from '@/lib/runner/types';
import { saveToWorkspaceLink, type Handoff } from '@/lib/handoff';
import { runToBibtex, saveRun, updateRun } from '@/lib/history';
import { GraphView } from './graph-view';
import { StudioButton } from './studio-button';
import { UsagePanel } from './usage-panel';

const MAX_FIXES = 3;

type Step = 'idle' | 'searching' | 'drafting' | 'running' | 'fixing' | 'judging' | 'done' | 'failed';

interface Props {
  kind: 'idea' | 'paper';
  title: string;
  placeholder: string;
  hint: string;
}

async function post<T>(url: string, body: unknown): Promise<{ ok: true; value: T; usage?: UsageEntry[] } | { ok: false; error: string; missing?: string; usage?: UsageEntry[] }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  // A route that throws returns an empty or HTML body; say so instead of a JSON parse error.
  const text = await res.text();
  if (!text) return { ok: false, error: `${url} returned an empty response (HTTP ${res.status}). See the pnpm dev terminal.` };
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: `${url} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}` };
  }
}

/** Open Resources links here with ?q=<title> ("Build this"); Suspense is what useSearchParams needs. */
export function FlowPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <Flow {...props} />
    </Suspense>
  );
}

function Flow({ kind, title, placeholder, hint }: Props) {
  const params = useSearchParams();
  const [input, setInput] = useState('');
  const [graph, setGraph] = useState<Subgraph | null>(null);
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  useEffect(() => {
    const q = params.get('q');
    if (q) setInput(q);
  }, [params]);
  const [step, setStep] = useState<Step>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [context, setContext] = useState<Resource[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [run, setRun] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [claim, setClaim] = useState('');
  const [signoff, setSignoff] = useState<'approved' | 'challenged' | null>(null);
  const [bibtex, setBibtex] = useState<'idle' | 'done' | 'failed'>('idle');
  const [savedId, setSavedId] = useState<string | null>(null);

  const say = (s: string) => setLog((l) => [...l, s]);

  /** post() that also collects the provider usage the route reports. */
  async function call<T>(url: string, body: unknown) {
    const r = await post<T>(url, body);
    if (r.usage?.length) setUsage((u) => [...u, ...(r.usage ?? [])]);
    return r;
  }

  async function start() {
    setStep('searching'); setLog([]); setError(null); setPlan(null); setFiles([]); setRun(null); setGraph(null); setUsage([]); setVerdict(null); setClaim(''); setSignoff(null); setBibtex('idle'); setSavedId(null);

    const found = await call<Resource[]>('/api/lab/search', { query: input.slice(0, 500), keep: 6 });
    if (!found.ok) return fail(found.error, found.missing);
    setContext(found.value);
    say(`Plan: found ${found.value.length} relevant open resources.`);

    // The graph is a bonus: if it is down or empty, the flow continues without it.
    let graphText = '';
    if (found.value.length) {
      const g = await call<Subgraph>('/api/lab/graph', { resources: found.value });
      if (g.ok && g.value.edges.length) {
        setGraph(g.value);
        graphText = describeGraph(g.value);
        say(`Knowledge graph: ${g.value.nodes.length - found.value.length} connected entities.`);
      }
    }

    setStep('drafting');
    const draft = await call<{ plan?: Plan; files: GeneratedFile[]; claim?: string }>(
      '/api/lab/plan',
      kind === 'idea' ? { kind, idea: input, context: found.value, graph: graphText } : { kind, text: input, context: found.value },
    );
    if (!draft.ok) return fail(draft.error, draft.missing);
    const planLocal = draft.value.plan;
    // Paper-ingest handoff: the server extracts the one testable claim the
    // notebook checks. The verdict judges that sentence, not the raw paste.
    // Falls back to the pasted text when the server predates the claim field.
    const claimLocal = kind === 'paper' ? (draft.value.claim || input.slice(0, 6000)) : '';
    if (claimLocal) setClaim(claimLocal);
    if (planLocal) setPlan(planLocal);
    let current = draft.value.files;
    setFiles(current);
    say(kind === 'idea' ? `Plan: Muse (heavy) drafted ${current.length} file(s) from ${planLocal?.steps.length ?? 0} steps.` : `Plan: Muse (heavy) drafted the reproduction${claimLocal ? ` to test "${claimLocal.slice(0, 120)}"` : ''}.`);

    const runner = kind === 'idea'
      ? (await import('@/lib/runner/webcontainer')).webcontainerRunner
      : (await import('@/lib/runner/pyodide')).pyodideRunner;
    if (!runner.available()) return fail(`${runner.name} cannot run in this browser.`);

    let lastFingerprint = '';
    const fixHistory: FixAttempt[] = [];
    for (let attempt = 0; attempt <= MAX_FIXES; attempt++) {
      setStep('running');
      say(attempt === 0 ? `Observe: running in ${runner.name}…` : `Observe: re-running after fix ${attempt}…`);
      const result = await runner.run(current, (line) => say(line.trimEnd()));
      setRun(result);
      if (result.ok) {
        say(result.previewUrl ? 'It runs. Live preview below.' : 'It runs.');

        // Running is not reproducing: for a paper, ask whether the output supports the claim.
        let v: Verdict | undefined;
        if (kind === 'paper') {
          setStep('judging');
          say('Checking the result against the paper\u2019s claim…');
          const readme = current.find((f) => /readme/i.test(f.path))?.content ?? '';
          const j = await call<Verdict>('/api/lab/verdict', { claim: claimLocal.slice(0, 6000), readme: readme.slice(0, 6000), output: result.output.slice(-6000) });
          if (j.ok) {
            v = j.value;
            setVerdict(v);
            say(`Verdict (wonder): ${v.verdict}. ${v.reason}`);
          } else {
            say(`Could not get a verdict: ${j.error}`);
          }
        }

        const saved = saveRun({
          kind, input, plan: planLocal, files: current, figures: result.figures, context: found.value, verdict: v,
          // Paper-ingest handoff, persisted: History keeps the exact sentence
          // the verdict judged, not just the verdict.
          claim: kind === 'paper' ? claimLocal || undefined : undefined,
          title: input.replace(/\s+/g, ' ').trim().slice(0, 70),
        });
        setSavedId(saved?.id ?? null);
        say(saved ? 'Saved to History.' : 'Could not save to History (browser storage is full or blocked).');
        setStep('done');
        return;
      }
      if (attempt === MAX_FIXES) break;

      // The same error twice means the last fix changed nothing that matters;
      // another paid call would likely buy the same patch back, so stop here.
      const print = errorFingerprint(result.error);
      if (print && print === lastFingerprint) {
        say('Same error as the last attempt. Stopping instead of spending another fix.');
        break;
      }
      lastFingerprint = print;

      setStep('fixing');
      say(`Act: error — ${result.error.split('\n')[0]}. Asking Muse (contributor) to fix (attempt ${attempt + 1}/${MAX_FIXES})…`);
      // The route caps the error at 8000 chars; trim client-side so a long
      // log fails loudly in the log box, not as a 400 from the route.
      // History is the observe step: earlier fingerprints keep the model from
      // repeating a patch that already failed.
      const fixed = await call<GeneratedFile[]>('/api/lab/fix', {
        files: current,
        error: tail(result.error, 8000),
        attempt: attempt + 1,
        history: fixHistory.slice(-3),
      });
      if (!fixed.ok) return fail(fixed.error, fixed.missing);
      if (JSON.stringify(fixed.value) === JSON.stringify(current)) {
        say('The fix came back unchanged. Stopping.');
        break;
      }
      fixHistory.push({ fingerprint: print, headline: result.error.split('\n')[0].slice(0, 300) });
      current = fixed.value;
      setFiles(current);
    }
    fail(`Still failing after ${MAX_FIXES} fixes. The files are below; the last error is in the log.`);
  }

  function fail(msg: string, missing?: string) {
    setError(missing ? `${msg}. Set ${missing} in .env.local.` : msg);
    setStep('failed');
    if (/needs a passcode/i.test(msg)) window.location.href = `/enter?next=${encodeURIComponent(window.location.pathname)}`;
  }

  /** HITL stamp: the researcher approves or challenges the machine verdict. */
  function stamp(decision: 'approved' | 'challenged') {
    setSignoff(decision);
    if (savedId) updateRun(savedId, { signoff: { decision, at: Date.now() } });
    // When History is unavailable (private mode) the stamp still travels in
    // the Studio handoff via signoffLine; say only what actually happened.
    say(
      decision === 'approved'
        ? savedId
          ? 'Signed off. The verdict travels with this run.'
          : 'Signed off. History is unavailable, so only the Studio handoff carries it.'
        : 'Challenged. Noted — re-check the CHECK line before trusting this figure.',
    );
  }

  async function copyBibtex() {
    const text = runToBibtex({ kind, claim: claim || undefined, context });
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setBibtex('done');
    } catch {
      setBibtex('failed');
    }
  }

  const busy = step !== 'idle' && step !== 'done' && step !== 'failed';
  const markdown = files.map((f) => `### ${f.path}\n\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <section className="grid gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-[var(--muted)]">{hint}</p>
        <textarea
          id={`${kind}-input`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          rows={kind === 'paper' ? 14 : 6}
          className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          id={`${kind}-start`}
          onClick={start}
          disabled={busy || input.trim().length < 5}
          className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          {busy ? step + '…' : 'Build it'}
        </button>
        {error && <p className="text-sm text-red-300">{error}</p>}

        {context.length > 0 && (
          <div>
            <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">What already exists</h2>
            <ul className="mt-2 grid gap-1 text-sm">
              {context.map((r) => (
                <li key={r.id}><a className="underline" href={r.url} target="_blank" rel="noreferrer">[{r.type}] {r.title}</a></li>
              ))}
            </ul>
          </div>
        )}
        {graph && (
          <div>
            <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">What connects them</h2>
            <div className="mt-2"><GraphView graph={graph} /></div>
          </div>
        )}
        {plan && (
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
            <p>{plan.summary}</p>
            <p className="mt-2"><b>Buildable:</b> {plan.buildable ? 'yes' : 'not yet'}</p>
            {plan.missing.length > 0 && <p className="mt-1"><b>Missing:</b> {plan.missing.join('; ')}</p>}
          </div>
        )}
      </section>

      <section className="grid content-start gap-3">
        <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">Log</h2>
        <pre className="max-h-64 overflow-auto rounded-md border border-[var(--line)] bg-black/40 p-3 text-xs">{log.join('\n') || '—'}</pre>
        <UsagePanel entries={usage} />
        {run?.previewUrl && (
          <div>
            <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">Live preview</h2>
            <iframe
              id="prototype-preview"
              title="The running prototype"
              src={run.previewUrl}
              className="mt-2 h-[480px] w-full rounded-md border border-[var(--line)] bg-white"
            />
          </div>
        )}
        {run?.figures?.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt={`Figure ${i + 1}`} className="rounded-md border border-[var(--line)]" />
        ))}
        {verdict && (
          <div
            id="verdict"
            className={`rounded-md border p-3 text-sm ${
              verdict.verdict === 'matches' ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10' : verdict.verdict === 'partial' ? 'border-amber-300/50 bg-amber-300/10' : 'border-red-400/50 bg-red-400/10'
            }`}
          >
            <b>{verdict.verdict === 'matches' ? 'Matches the paper\u2019s claim.' : verdict.verdict === 'partial' ? 'Partly matches the claim.' : 'Does not match the claim.'}</b>{' '}
            {verdict.reason}
            {verdict.missing && (
              <span className="mt-1 block text-xs text-[var(--muted)]">To strengthen: {verdict.missing}</span>
            )}
            {step === 'done' && !signoff && (
              <span className="mt-2 flex flex-wrap gap-2">
                <button id="verdict-approve" onClick={() => stamp('approved')} className="rounded-md border border-[var(--accent)] px-2 py-1 text-xs">
                  Sign off
                </button>
                <button id="verdict-challenge" onClick={() => stamp('challenged')} className="rounded-md border border-[var(--line)] px-2 py-1 text-xs">
                  Challenge
                </button>
              </span>
            )}
            {signoff && (
              <span className="mt-1 block text-xs text-[var(--muted)]">
                {signoff === 'approved' ? 'You signed off on this verdict.' : 'You challenged this verdict — noted in History.'}
              </span>
            )}
            <span className="mt-1 block text-xs text-[var(--muted)]">Judged from the printed output on synthetic data. Not a peer review.</span>
          </div>
        )}
        {files.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm">{files.length} file(s)</summary>
            {files.map((f) => (
              <div key={f.path} className="mt-2">
                <div className="font-mono text-xs text-[var(--muted)]">{f.path}</div>
                <pre className="max-h-64 overflow-auto rounded-md bg-black/40 p-2 text-xs">{f.content}</pre>
              </div>
            ))}
          </details>
        )}
        {step === 'done' && (
          <div className="flex flex-wrap gap-2">
            <a className="rounded-md border border-[var(--accent)] px-3 py-1.5 text-sm" href={saveToWorkspaceLink(input.slice(0, 80), markdown).url} target="_blank" rel="noreferrer">
              Save to Workspace ↗
            </a>
            <a className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm" href="/history">History</a>
            {context.length > 0 && (
              <button id="copy-bibtex" onClick={copyBibtex} className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm">
                {bibtex === 'done' ? 'BibTeX copied' : bibtex === 'failed' ? 'Copy failed — see History' : 'Copy BibTeX'}
              </button>
            )}
            <StudioButton
              title={input.replace(/\s+/g, ' ').trim().slice(0, 70) || 'Lab prototype'}
              idea={kind === 'paper' ? `Paper reproduction. ${claim || input.slice(0, 500)}`.slice(0, 2000) : input}
              summary={plan?.summary}
              plan={plan}
              claim={kind === 'paper' && claim ? claim.slice(0, 1500) : undefined}
              verdictLine={verdict ? `${verdict.verdict} — ${verdict.reason}${verdict.missing ? ` To strengthen: ${verdict.missing}` : ''}`.slice(0, 500) : undefined}
              signoffLine={signoff ?? undefined}
              files={files}
              runId={savedId}
              onOpened={(h: Handoff) => say(`Opened in App Studio: ${h.url}`)}
            />
          </div>
        )}
      </section>
    </div>
  );
}
