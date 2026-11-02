'use client';

/**
 * "Open in Studio": create an App Studio project on openidea.world from the
 * prototype. The visitor's own platform API key is asked for once and kept in
 * this browser (localStorage), sent to our route for the one call, never stored
 * server-side. Studio is the platform's product; Lab only hands the work over.
 */

import { useEffect, useState } from 'react';
import type { Handoff } from '@/lib/handoff';
import type { GeneratedFile, Plan } from '@/lib/muse';
import { getRun, updateRun } from '@/lib/history';

const KEY_STORAGE = 'openidea-lab:api-key';

interface Props {
  title: string;
  idea: string;
  summary?: string;
  plan?: Plan | null;
  /** Paper runs: the tested claim, verdict line and sign-off for the description. */
  claim?: string;
  verdictLine?: string;
  signoffLine?: string;
  files: GeneratedFile[];
  /** History entry to stamp with the Studio URL once opened. */
  runId: string | null;
  onOpened?: (h: Handoff) => void;
}

export function StudioButton({ title, idea, summary, plan, claim, verdictLine, signoffLine, files, runId, onOpened }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Handoff | null>(null);

  useEffect(() => {
    try {
      setApiKey(localStorage.getItem(KEY_STORAGE) ?? '');
    } catch {
      /* private mode: ask every time */
    }
  }, []);

  async function go() {
    if (!apiKey.trim()) return setAsking(true);
    setBusy(true);
    setError(null);
    const res = await fetch('/api/lab/studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        idea,
        summary,
        buildable: plan?.buildable,
        exists: plan?.exists,
        missing: plan?.missing,
        steps: plan?.steps,
        files,
        claim,
        verdictLine,
        signoffLine,
        // Carried into the Studio description as a link back to this Lab run,
        // so Studio's builder can see the reproduction and verdict behind it.
        labRunId: runId,
        apiKey: apiKey.trim(),
      }),
    });
    const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    setBusy(false);
    if (!body.ok) {
      if (res.status === 401) {
        try { localStorage.removeItem(KEY_STORAGE); } catch { /* ignore */ }
        setApiKey('');
        setAsking(true);
      }
      return setError(body.error ?? 'Could not open in Studio.');
    }
    try { localStorage.setItem(KEY_STORAGE, apiKey.trim()); } catch { /* ignore */ }
    setOpened(body.value);
    setAsking(false);
    onOpened?.(body.value);
    // Remember where it went, next to the saved run (same id, so the
    // History → run → Studio link round-trips).
    if (runId && getRun(runId)) {
      updateRun(runId, { studioUrl: body.value.url });
    }
    window.open(body.value.url, '_blank', 'noopener');
  }

  if (opened) {
    return (
      <a id="studio-open" className="rounded-md border border-[var(--accent)] px-3 py-1.5 text-sm" href={opened.url} target="_blank" rel="noreferrer">
        Open in Studio ↗
      </a>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button id="studio-button" onClick={go} disabled={busy || !files.length} className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:border-[var(--accent)] disabled:opacity-40">
          {busy ? 'Creating project…' : 'Open in Studio'}
        </button>
        {asking && (
          <>
            <input
              id="studio-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="openidea.world API key (oi_live_…)"
              className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button id="studio-api-key-go" onClick={go} disabled={!apiKey.trim() || busy} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40">
              Continue
            </button>
          </>
        )}
      </div>
      {asking && (
        <p className="text-xs text-[var(--muted)]">
          Get a key at <a className="underline" href="https://openidea.world/developer" target="_blank" rel="noreferrer">openidea.world/developer</a>. It stays in this browser and is used only to create your project.
        </p>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
