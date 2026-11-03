'use client';

import { useEffect, useState } from 'react';
import { deleteRun, listRuns, parseRunImport, runToBibtex, runToMarkdown, saveRun, type SavedRun } from '@/lib/history';
import { saveToWorkspaceLink } from '@/lib/handoff';

const ICON = { idea: '💡', paper: '📄', photo: '📷' } as const;

function download(run: SavedRun, format: 'md' | 'json') {
  const body = format === 'md' ? runToMarkdown(run) : JSON.stringify(run, null, 2);
  const url = URL.createObjectURL(new Blob([body], { type: format === 'md' ? 'text/markdown' : 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${run.kind}-${run.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'run'}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<SavedRun[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    const list = listRuns();
    setRuns(list);
    setOpenId(list[0]?.id ?? null);
  }, []);

  async function importFile(file: File) {
    setImportError(null);
    try {
      const saved = saveRun(parseRunImport(await file.text()));
      if (!saved) {
        setImportError('The browser refused to store it (private mode or quota).');
        return;
      }
      const list = listRuns();
      setRuns(list);
      setOpenId(saved.id);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  }

  if (runs === null) return null;
  const open = runs.find((r) => r.id === openId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <section className="grid content-start gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-[var(--muted)]">Saved in this browser only. Download a run to keep it elsewhere.</p>
        <label className="mt-1 inline-block cursor-pointer rounded-md border border-[var(--line)] px-3 py-1.5 text-sm">
          Import run (.json)
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
        </label>
        {importError && <p className="text-sm text-red-300">{importError}</p>}
        {runs.length === 0 && <p className="mt-2 text-sm text-[var(--muted)]">Nothing yet. Finished idea, paper and photo runs appear here.</p>}
        {runs.map((r) => (
          <button
            key={r.id}
            id={`run-${r.id}`}
            onClick={() => { setOpenId(r.id); setCopied(false); }}
            className={`rounded-md border p-3 text-left text-sm ${r.id === openId ? 'border-[var(--accent)] bg-[var(--surface)]' : 'border-[var(--line)] hover:border-[var(--muted)]'}`}
          >
            <span className="mr-1">{ICON[r.kind]}</span>
            {r.title}
            <span className="mt-1 block text-xs text-[var(--muted)]">{new Date(r.createdAt).toLocaleString()}</span>
          </button>
        ))}
      </section>

      {open && (
        <section className="grid min-w-0 content-start gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-lg font-medium">{open.title}</h2>
            <button id="download-run" onClick={() => download(open, 'md')} className="rounded-md border border-[var(--accent)] px-3 py-1.5 text-sm">
              Download .md
            </button>
            <button id="download-run-json" onClick={() => download(open, 'json')} className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm">
              Export .json
            </button>
            {open.context && open.context.length > 0 && (
              <button
                id="copy-bibtex"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(runToBibtex(open));
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
                className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
              >
                {copied ? 'BibTeX copied' : 'Copy BibTeX'}
              </button>
            )}
            <a
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
              href={saveToWorkspaceLink(open.title, runToMarkdown(open)).url}
              target="_blank"
              rel="noreferrer"
            >
              Save to Workspace ↗
            </a>
            <button
              id="delete-run"
              onClick={() => {
                deleteRun(open.id);
                const list = listRuns();
                setRuns(list);
                setOpenId(list[0]?.id ?? null);
              }}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-red-300"
            >
              Delete
            </button>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-wide text-[var(--muted)]">Input</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm">{open.input}</p>
          </div>

          {open.plan && (
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
              <p>{open.plan.summary}</p>
              <p className="mt-2"><b>Buildable:</b> {open.plan.buildable ? 'yes' : 'not yet'}</p>
              {open.plan.missing.length > 0 && <p className="mt-1"><b>Missing:</b> {open.plan.missing.join('; ')}</p>}
            </div>
          )}

          {open.claim && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-[var(--muted)]">Claim tested</h3>
              <p className="mt-1 text-sm">{open.claim}</p>
            </div>
          )}

          {open.scale && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-[var(--muted)]">Scale (this run vs the paper)</h3>
              <p className="mt-1 text-sm">{open.scale}</p>
            </div>
          )}

          {open.verdict && (
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
              <p><b>Verdict: {open.verdict.verdict}</b> — {open.verdict.reason}</p>
              {open.verdict.missing && <p className="mt-1 text-xs text-[var(--muted)]">To strengthen: {open.verdict.missing}</p>}
              {open.signoff && (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Researcher sign-off: {open.signoff.decision} ({new Date(open.signoff.at).toLocaleString()}).
                </p>
              )}
            </div>
          )}

          {open.markdown && <pre className="whitespace-pre-wrap rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">{open.markdown}</pre>}

          {open.figures?.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt={`Figure ${i + 1}`} className="max-w-full rounded-md border border-[var(--line)]" />
          ))}

          {open.files?.map((f) => (
            <details key={f.path}>
              <summary className="cursor-pointer font-mono text-xs text-[var(--muted)]">{f.path}</summary>
              <pre className="mt-1 max-h-96 overflow-auto rounded-md bg-black/40 p-2 text-xs">{f.content}</pre>
            </details>
          ))}

          {open.context && open.context.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-[var(--muted)]">Related open resources</h3>
              <ul className="mt-1 grid gap-1 text-sm">
                {open.context.map((r) => (
                  <li key={r.id}><a className="underline" href={r.url} target="_blank" rel="noreferrer">[{r.type}] {r.title}</a></li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
