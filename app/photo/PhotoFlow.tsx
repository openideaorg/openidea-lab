'use client';

/**
 * Photo → SAM 3 (Baseten) → crops → Muse labels → OpenIdea search →
 * Muse parts list. Masks are drawn over the photo on a canvas; crops for
 * labelling are cut client-side so the server never needs the image twice.
 */

import { useRef, useState } from 'react';
import type { Segment, SegmentResult } from '@/lib/baseten-sam3';
import type { LabelledPart } from '@/lib/muse';
import { saveToWorkspaceLink } from '@/lib/handoff';
import { saveRun } from '@/lib/history';
import type { UsageEntry } from '@/lib/usage-types';
import { UsagePanel } from '../usage-panel';

type Step = 'idle' | 'segmenting' | 'warming' | 'labelling' | 'done' | 'failed';

export function PhotoFlow() {
  const [image, setImage] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [parts, setParts] = useState<LabelledPart[]>([]);
  const [markdown, setMarkdown] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { setImage(String(r.result)); setStep('idle'); setSegments([]); setParts([]); setMarkdown(''); setError(null); };
    r.readAsDataURL(f);
  }

  async function analyse() {
    if (!image) return;
    setError(null);
    setUsage([]);
    setStep('segmenting');

    // Retry while the Baseten replica warms up (scale-to-zero cold start).
    let seg: SegmentResult | null = null;
    for (let i = 0; i < 12 && !seg; i++) {
      const res = await fetch('/api/lab/segment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) });
      const body = await res.json();
      addUsage(body.usage);
      if (!body.ok) return fail(body.error, body.missing);
      if (body.value.warming) { setStep('warming'); await new Promise((r) => setTimeout(r, 8000)); continue; }
      seg = body.value;
    }
    if (!seg || seg.warming) return fail('SAM 3 is still starting. Try again in a minute.');
    setSegments(seg.segments);
    const crops = await drawAndCrop(image, seg.segments);

    setStep('labelling');
    // The route only needs the crops here; the full photo was already sent to segment.
    const res = await fetch('/api/lab/segment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ crops }) });
    const body = await res.json();
    addUsage(body.usage);
    if (!body.ok) return fail(body.error, body.missing);
    setParts(body.value.parts);
    setMarkdown(body.value.markdown);
    saveRun({ kind: 'photo', title: 'Parts list', input: 'Photo of hardware', parts: body.value.parts, markdown: body.value.markdown, context: body.value.context });
    setStep('done');
  }

  async function drawAndCrop(src: string, segs: Segment[]): Promise<string[]> {
    const img = await loadImage(src);
    const c = canvas.current!;
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    ctx.lineWidth = Math.max(2, img.width / 300);
    ctx.strokeStyle = '#4fd1a1';
    ctx.font = `${Math.max(12, img.width / 50)}px sans-serif`;
    ctx.fillStyle = '#4fd1a1';
    const crops: string[] = [];
    segs.forEach((s, i) => {
      const [x, y, w, h] = s.bbox;
      ctx.strokeRect(x, y, w, h);
      ctx.fillText(String(i + 1), x + 4, y + Math.max(14, img.width / 50));
      const cc = document.createElement('canvas');
      cc.width = Math.max(1, w); cc.height = Math.max(1, h);
      cc.getContext('2d')!.drawImage(img, x, y, w, h, 0, 0, w, h);
      crops.push(cc.toDataURL('image/jpeg', 0.85));
    });
    return crops;
  }

  function addUsage(entries?: UsageEntry[]) {
    if (entries?.length) setUsage((u) => [...u, ...entries]);
  }

  function fail(msg: string, missing?: string) {
    setError(missing ? `${msg}. Set ${missing} in .env.local.` : msg);
    setStep('failed');
  }

  const busy = step === 'segmenting' || step === 'warming' || step === 'labelling';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <section className="grid content-start gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Start from a photo</h1>
        <p className="text-sm text-[var(--muted)]">
          SAM 3 outlines every part. Muse names them, openidea.world finds datasheets and listings, Muse writes the parts list.
        </p>
        <input id="photo-file" type="file" accept="image/*" onChange={onFile} className="text-sm" />
        <button
          id="photo-analyse"
          onClick={analyse}
          disabled={!image || busy}
          className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          {step === 'warming' ? 'Starting the GPU…' : busy ? step + '…' : 'Outline the parts'}
        </button>
        {error && <p className="text-sm text-red-300">{error}</p>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && segments.length === 0 && <img src={image} alt="Your photo" className="rounded-md border border-[var(--line)]" />}
        <canvas ref={canvas} className={segments.length ? 'max-w-full rounded-md border border-[var(--line)]' : 'hidden'} />
      </section>
      <section className="grid content-start gap-3">
        <UsagePanel entries={usage} />
        {parts.length > 0 && (
          <ol className="grid gap-1 text-sm">
            {parts.map((p) => (
              <li key={p.index}>{p.index + 1}. {p.name} <span className="text-[var(--muted)]">({Math.round(p.confidence * 100)}%)</span></li>
            ))}
          </ol>
        )}
        {markdown && <pre className="whitespace-pre-wrap rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">{markdown}</pre>}
        {step === 'done' && (
          <a className="w-fit rounded-md border border-[var(--accent)] px-3 py-1.5 text-sm" href={saveToWorkspaceLink('Parts list', markdown).url} target="_blank" rel="noreferrer">
            Save to Workspace ↗
          </a>
        )}
      </section>
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
