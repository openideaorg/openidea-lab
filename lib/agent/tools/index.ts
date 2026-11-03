/**
 * Tool registry — handbook pattern: definitions() + run().
 * LLM reasoning tools use Muse only (via lib/muse.ts + lib/muse-agent.ts).
 * segment_photo is the one exception that touches the GPU: it calls the
 * existing Baseten SAM client, then returns to Muse for names + parts list.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  search,
  resolvePaper,
  extractPaper,
  exportCitations,
  detectPaperId,
  detectPaperIds,
  type PaperResolveInput,
  type Resource,
} from '../../openidea';
import { neighbourhood, describeGraph } from '../../graph';
import { draftNotebook, draftPrototype, enrichParts, labelSegments, planIdea, type Plan } from '../../muse';
import { museFix, museRank, museVerdict } from '../../muse-agent';
import { segment } from '../../baseten-sam3';
import { overBudget } from '../../budget';
import { getLabPlan, freeFenceMessage } from '../../lab-plan';
import { checkPlan } from '../verify/plan';
import { checkPrototype } from '../verify/prototype';
import { checkClaimsShape } from '../verify/claims';
import type { LabRun, ToolCall } from '../types';

export const TOOL_NAMES = [
  'resolve_paper',
  'search_open',
  'expand_graph',
  'segment_photo',
  'set_plan',
  'draft_code',
  'run_sandbox',
  'fix_code',
  'judge_paper',
  'cite_sources',
  'submit_prototype',
  'request_human',
  'handoff_studio',
  'finish',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/** Runs cap the held photo: data URLs bloat the progress store past this (~2MB of JPEG). */
export const MAX_PHOTO_CHARS = 3_000_000;

/** Labelling is priced per image, so a busy photo is cut to the top 12 (same cap as POST /api/lab/segment). */
const MAX_PHOTO_PARTS = 12;

export function definitions(): { name: string; description: string }[] {
  return [
    { name: 'resolve_paper', description: 'Resolve arXiv/DOI/URL papers and extract text. Single (arxiv:1706.03762) or multi (papers:[{arxiv},{doi},…], up to 5)' },
    { name: 'search_open', description: 'Search openidea.world and Muse-rank results' },
    { name: 'expand_graph', description: 'Expand knowledge-graph neighbourhood for resources' },
    { name: 'segment_photo', description: 'Segment the run photo (SAM 3 on Baseten) and name the parts (Muse). Photo runs only; the photo is already on the run, call with {}' },
    { name: 'set_plan', description: 'Muse write a structural plan (verified)' },
    { name: 'draft_code', description: 'Muse draft prototype / notebook files' },
    { name: 'run_sandbox', description: 'Pause for client browser sandbox (WebContainer/Pyodide)' },
    { name: 'fix_code', description: 'Muse patch files from last sandbox error (max 3)' },
    { name: 'judge_paper', description: 'Muse verdict: output vs paper claim' },
    { name: 'cite_sources', description: 'BibTeX from retrieved resources (platform export on Pro)' },
    { name: 'submit_prototype', description: 'Verification gate before export/handoff' },
    { name: 'request_human', description: 'Pause for approve_plan / missing info / sign-off' },
    { name: 'handoff_studio', description: 'Mark ready for Studio handoff after submit' },
    { name: 'finish', description: 'Terminal stop' },
  ];
}

export type ToolOutcome = {
  observation: string;
  /** Client must execute sandbox and resume. */
  needsClientSandbox?: boolean;
  needsHuman?: boolean;
  terminal?: boolean;
};

export async function runTool(run: LabRun, call: ToolCall): Promise<ToolOutcome> {
  const name = call.name as ToolName;
  if (!TOOL_NAMES.includes(name)) {
    return { observation: JSON.stringify({ error: `Unknown tool ${call.name}. Pick one of: ${TOOL_NAMES.join(', ')}` }) };
  }
  switch (name) {
    case 'resolve_paper':
      return resolvePaperTool(run, call.args);
    case 'search_open':
      return searchOpen(run, call.args);
    case 'expand_graph':
      return expandGraph(run);
    case 'segment_photo':
      return segmentPhoto(run, call.args);
    case 'set_plan':
      return setPlan(run);
    case 'draft_code':
      return draftCode(run);
    case 'run_sandbox':
      return runSandbox(run);
    case 'fix_code':
      return fixCode(run, call.args);
    case 'judge_paper':
      return judgePaper(run);
    case 'cite_sources':
      return citeSources(run);
    case 'submit_prototype':
      return submitPrototype(run);
    case 'request_human':
      return requestHuman(run, call.args);
    case 'handoff_studio':
      return handoffStudio(run);
    case 'finish':
      return finish(run, call.args);
  }
}

async function resolvePaperTool(run: LabRun, args: Record<string, unknown>): Promise<ToolOutcome> {
  // Multi-paper path (C1): `papers: [{arxiv}, {doi}, {url}]` resolves each in
  // turn and accumulates resources, so the run is never single-paper-only.
  // Single-paper args and free-text detection keep working as before.
  const wanted: PaperResolveInput[] = [];
  if (Array.isArray(args.papers)) {
    for (const p of (args.papers as unknown[]).slice(0, 5)) {
      if (!p || typeof p !== 'object') continue;
      const r = p as Record<string, unknown>;
      if (typeof r.arxiv === 'string' && r.arxiv.trim()) wanted.push({ arxiv: r.arxiv.trim() });
      else if (typeof r.doi === 'string' && r.doi.trim()) wanted.push({ doi: r.doi.trim() });
      else if (typeof r.url === 'string' && r.url.trim()) wanted.push({ url: r.url.trim() });
    }
  } else {
    const one: PaperResolveInput = {};
    if (typeof args.arxiv === 'string' && args.arxiv.trim()) one.arxiv = args.arxiv.trim();
    else if (typeof args.doi === 'string' && args.doi.trim()) one.doi = args.doi.trim();
    else if (typeof args.url === 'string' && args.url.trim()) one.url = args.url.trim();
    else {
      const detected = detectPaperId(run.input);
      if (detected) Object.assign(one, detected);
    }
    if (one.arxiv || one.doi || one.url) wanted.push(one);
  }
  if (!wanted.length) {
    // A paste of several references ("compare 1706.03762 with 1409.1556") —
    // resolve every id mentioned instead of failing single-paper-only.
    wanted.push(...detectPaperIds(run.input));
  }
  if (!wanted.length) {
    return {
      observation: JSON.stringify({
        ok: false,
        error: 'Provide arxiv, doi, url, or papers:[{arxiv|doi|url}, …] (e.g. arxiv:1706.03762).',
      }),
    };
  }

  const mode = args.mode === 'pdf' ? ('pdf' as const) : ('abstract' as const);
  const papers: Array<Record<string, unknown>> = [];
  let firstText = '';
  for (const input of wanted.slice(0, 5)) {
    const extracted = await extractPaper({ ...input, mode });
    if (!extracted.ok) {
      // Fall back to metadata-only resolve so search can still proceed.
      const resolved = await resolvePaper(input);
      if (!resolved.ok) {
        papers.push({ ok: false, input, error: resolved.error });
        continue;
      }
      upsertResource(run, resolved.value.resource);
      papers.push({
        ok: true,
        resource: brief(resolved.value.resource),
        pdfUrl: resolved.value.pdfUrl,
        textChars: 0,
        note: 'extract failed; metadata only',
        extractError: extracted.error,
      });
      continue;
    }
    upsertResource(run, extracted.value.resource);
    if (!firstText && extracted.value.text) firstText = extracted.value.text;
    papers.push({
      ok: true,
      resource: brief(extracted.value.resource),
      pdfUrl: extracted.value.pdfUrl,
      source: extracted.value.source,
      truncated: extracted.value.truncated,
      textChars: extracted.value.text.length,
      sections: extracted.value.sections.map((s) => s.heading),
    });
  }

  const succeeded = papers.filter((p) => p.ok === true);
  if (!succeeded.length) {
    return { observation: JSON.stringify({ ok: false, count: 0, papers }) };
  }
  // Prefer extracted text as the paper-run input when the user only pasted
  // id(s) — single-paper case only, so a multi-paper paste keeps its context.
  if (firstText && (run.input.length < 200 || (wanted.length === 1 && detectPaperId(run.input)))) {
    const first = succeeded[0].resource as { title?: string };
    run.input = [
      typeof first?.title === 'string' ? first.title : '',
      firstText,
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 60_000);
  }

  const single = papers.length === 1 ? papers[0] : undefined;
  return {
    observation: JSON.stringify({
      ok: true,
      count: succeeded.length,
      papers,
      // Single-paper shape is unchanged for older controllers.
      ...(single ? single : {}),
    }),
  };
}

async function searchOpen(run: LabRun, args: Record<string, unknown>): Promise<ToolOutcome> {
  const q = String(args.query ?? run.input).slice(0, 500);
  const found = await search(q, { limit: 20 });
  if (!found.ok) return { observation: JSON.stringify(found) };
  const ranked = await museRank(q, found.value, 6);
  if (!ranked.ok) {
    run.resources = mergeResources(run.resources, found.value.slice(0, 6));
    return { observation: JSON.stringify({ ok: true, resources: run.resources.map(brief), note: 'rank skipped', rankError: ranked.error }) };
  }
  run.resources = mergeResources(run.resources, ranked.value);
  return { observation: JSON.stringify({ ok: true, count: run.resources.length, resources: run.resources.map(brief) }) };
}

async function expandGraph(run: LabRun): Promise<ToolOutcome> {
  if (!run.resources.length) return { observation: JSON.stringify({ ok: false, error: 'No resources yet; search_open first.' }) };
  const g = await neighbourhood(run.resources);
  if (!g.ok) return { observation: JSON.stringify(g) };
  run.graphText = describeGraph(g.value);
  return {
    observation: JSON.stringify({
      ok: true,
      nodes: g.value.nodes.length,
      edges: g.value.edges.length,
      graphText: run.graphText,
    }),
  };
}

/**
 * Photo tool: the server-side mirror of POST /api/lab/segment's two calls in
 * one turn. SAM 3 segments, Muse names each box from the full photo + box
 * list, OpenIdea finds datasheets/listings, Muse writes the parts list.
 * Every provider is optional: a missing key returns a named observation, never
 * a throw, so the controller can degrade to request_human.
 */
async function segmentPhoto(run: LabRun, args: Record<string, unknown>): Promise<ToolOutcome> {
  const incoming = typeof args.image === 'string' ? args.image : undefined;
  if (incoming) {
    if (!incoming.startsWith('data:image/')) {
      return { observation: JSON.stringify({ ok: false, error: 'image must be a data:image/... URL.' }) };
    }
    if (incoming.length > MAX_PHOTO_CHARS) {
      return {
        observation: JSON.stringify({
          ok: false,
          error: `Photo is ${(incoming.length / 1e6).toFixed(1)}MB; shrink it under ~2MB (resize/compress) and call segment_photo again.`,
        }),
      };
    }
    run.photoImage = incoming;
  }
  const image = run.photoImage;
  if (!image) {
    run.status = 'needs_input';
    run.stopReason = 'photo_upload';
    return {
      observation: JSON.stringify({
        ok: false,
        waiting: 'photo_upload',
        error: 'No photo on this run. Ask for one via request_human, then resume with the image attached.',
      }),
      needsHuman: true,
    };
  }
  const prompt = typeof args.prompt === 'string' ? args.prompt.slice(0, 300) : undefined;

  const blocked = await overBudget('baseten');
  if (blocked) return { observation: JSON.stringify({ ok: false, error: blocked, budget: true }) };

  const seg = await segment(image, prompt);
  if (!seg.ok) return { observation: JSON.stringify(seg) };
  if (seg.value.warming) {
    return {
      observation: JSON.stringify({
        ok: true,
        warming: true,
        retry: 'The GPU is still starting (scale-to-zero cold start, 30–90s). Call segment_photo again with {}.',
      }),
    };
  }
  const top = seg.value.segments.slice(0, MAX_PHOTO_PARTS);
  if (!top.length) {
    return {
      observation: JSON.stringify({ ok: true, segments: 0, note: 'SAM 3 returned no segments. Ask for a closer photo or finish.' }),
    };
  }
  // Masks stay out of the run: each is a full-size PNG data URL.
  run.photoSegments = top.map((s) => ({ index: s.index, bbox: s.bbox, score: s.score }));

  const labelled = await labelSegments(image, run.photoSegments);
  if (!labelled.ok) {
    return { observation: JSON.stringify({ ...labelled, segments: run.photoSegments }) };
  }
  run.parts = labelled.value;

  const names = run.parts.map((p) => p.name);
  const found = await search(names.slice(0, 5).join(' '), { types: ['hardware', 'code'], limit: 10 });
  // Search stays best-effort: the parts list is still writable without context.
  const context = found.ok ? found.value : [];
  run.resources = mergeResources(run.resources, context);

  const list = await enrichParts(names, context);
  if (!list.ok) {
    return {
      observation: JSON.stringify({
        ok: true,
        segments: run.photoSegments,
        parts: run.parts,
        warning: `parts list failed: ${list.error}`,
        ...(list.missing ? { missing: list.missing } : {}),
      }),
    };
  }
  run.partsMarkdown = list.value;
  return {
    observation: JSON.stringify({
      ok: true,
      segments: run.photoSegments.length,
      boxes: run.photoSegments,
      parts: run.parts,
      markdown: run.partsMarkdown,
      searchNote: found.ok ? `${context.length} openidea resources merged` : `search skipped: ${found.error}`,
    }),
  };
}

async function setPlan(run: LabRun): Promise<ToolOutcome> {
  if (run.kind === 'photo') {
    const plan: Plan = {
      summary: 'Segment the hardware photo, name each part, find datasheets/listings, write the parts list.',
      buildable: true,
      exists: [
        'Uploaded hardware photo',
        ...run.resources.slice(0, 3).map((r) => r.title),
        ...(run.photoSegments?.length ? [`${run.photoSegments.length} SAM segments`] : []),
      ],
      missing: run.partsMarkdown ? ['nothing critical'] : ['segment_photo observation'],
      steps: ['segment_photo', 'cite_sources', 'submit_prototype'],
    };
    const check = checkPlan(plan);
    if (!check.ok) return { observation: JSON.stringify({ ok: false, refused: true, feedback: check.feedback }) };
    run.plan = plan;
    return { observation: JSON.stringify({ ok: true, plan }) };
  }
  if (run.kind === 'paper') {
    const graphNote = run.graphText ? ` Graph grounding: ${run.graphText.slice(0, 500)}` : '';
    const plan: Plan = {
      summary: `Reproduce one key claim from the paper on small synthetic data.${graphNote}`,
      buildable: true,
      exists: [
        ...run.resources.slice(0, 3).map((r) => r.title),
        ...(run.graphText ? ['Knowledge-graph neighbourhood loaded'] : []),
      ],
      missing: run.input.length > 500 ? [] : ['Paper abstract/text via resolve_paper if only an id was given'],
      steps: [
        'resolve_paper if starting from arXiv/DOI',
        'Identify one claim',
        'Draft Pyodide script with CHECK line',
        'Run + judge_paper',
        'Cite + submit',
      ],
    };
    const check = checkPlan(plan);
    if (!check.ok) return { observation: JSON.stringify({ ok: false, refused: true, feedback: check.feedback }) };
    run.plan = plan;
    return { observation: JSON.stringify({ ok: true, plan, note: 'Paper claim plan set. Approve via request_human if HITL required.' }) };
  }
  const planned = await planIdea(run.input, run.resources, run.graphText ?? '');
  if (!planned.ok) return { observation: JSON.stringify(planned) };
  const check = checkPlan(planned.value);
  if (!check.ok) return { observation: JSON.stringify({ ok: false, refused: true, feedback: check.feedback, plan: planned.value }) };
  run.plan = planned.value;
  return { observation: JSON.stringify({ ok: true, plan: planned.value }) };
}

async function draftCode(run: LabRun): Promise<ToolOutcome> {
  const plan = getLabPlan(run.planTier);
  if (run.kind === 'idea') {
    if (!run.plan) return { observation: JSON.stringify({ ok: false, error: 'Call set_plan first.' }) };
    if (plan.hitlSignOff && !run.planApproved) {
      return {
        observation: JSON.stringify({
          ok: false,
          error: 'Plan not approved yet. Call request_human with reason approve_plan, or wait for resume.',
        }),
      };
    }
    const files = await draftPrototype(run.input, run.plan);
    if (!files.ok) return { observation: JSON.stringify(files) };
    run.files = files.value;
    return { observation: JSON.stringify({ ok: true, files: run.files.map((f) => f.path) }) };
  }
  const drafted = await draftNotebook(run.input, run.resources);
  if (!drafted.ok) return { observation: JSON.stringify(drafted) };
  run.files = drafted.value.files;
  // The claim is the paper-ingest handoff: judge_paper judges this exact
  // sentence, not the raw paste (same rule as the one-shot paper flow).
  run.claim = drafted.value.claim;
  if (!run.plan) {
    run.plan = {
      summary: 'Paper reproduction notebook drafted.',
      buildable: true,
      exists: run.resources.slice(0, 3).map((r) => r.title),
      missing: ['Full PDF if needed'],
      steps: ['Run sandbox', 'Judge', 'Cite', 'Submit'],
    };
  }
  return { observation: JSON.stringify({ ok: true, files: run.files.map((f) => f.path) }) };
}

function runSandbox(run: LabRun): ToolOutcome {
  if (!run.files.length) return { observation: JSON.stringify({ ok: false, error: 'No files to run.' }) };
  run.status = 'needs_client';
  run.pendingTool = { name: 'run_sandbox', args: {} };
  return {
    observation: JSON.stringify({ ok: true, pending: 'run_sandbox', files: run.files.map((f) => f.path) }),
    needsClientSandbox: true,
  };
}

async function fixCode(run: LabRun, args: Record<string, unknown>): Promise<ToolOutcome> {
  if (run.fixCount >= 3) {
    return { observation: JSON.stringify({ ok: false, error: 'Fix limit (3) reached. request_human or finish.' }) };
  }
  const error = String(args.error ?? run.sandbox?.error ?? '');
  if (!error) return { observation: JSON.stringify({ ok: false, error: 'No sandbox error on record.' }) };
  if (!run.files.length) return { observation: JSON.stringify({ ok: false, error: 'No files to fix.' }) };
  // attempt === current fixCount: 0–1 Spark primary; ≥2 Contributor (cheaper retry).
  const fixed = await museFix(run.files, error, { attempt: run.fixCount });
  if (!fixed.ok) return { observation: JSON.stringify(fixed) };
  run.files = fixed.value;
  run.fixCount += 1;
  return {
    observation: JSON.stringify({
      ok: true,
      fixCount: run.fixCount,
      files: run.files.map((f) => f.path),
      museAttempt: run.fixCount - 1,
    }),
  };
}

async function judgePaper(run: LabRun): Promise<ToolOutcome> {
  if (run.kind !== 'paper') return { observation: JSON.stringify({ ok: false, error: 'judge_paper is for paper runs.' }) };
  const readme = run.files.find((f) => /readme/i.test(f.path))?.content ?? '';
  const output = run.sandbox?.output ?? '';
  if (!output) return { observation: JSON.stringify({ ok: false, error: 'Need a sandbox observation first.' }) };
  const claim = run.claim || run.input.slice(0, 6000);
  const v = await museVerdict(claim, readme.slice(0, 6000), output.slice(-6000));
  if (!v.ok) return { observation: JSON.stringify(v) };
  const shaped = checkClaimsShape(v.value);
  if (!shaped.ok) return { observation: JSON.stringify({ ok: false, feedback: shaped.feedback }) };
  run.verdict = shaped.verdict;
  return { observation: JSON.stringify({ ok: true, verdict: run.verdict, claim }) };
}

async function citeSources(run: LabRun): Promise<ToolOutcome> {
  if (!run.resources.length) return { observation: JSON.stringify({ ok: false, error: 'No resources to cite.' }) };
  run.citations = run.resources.map((r) => ({
    title: r.title,
    url: r.url,
    type: r.type,
    doi: r.doi,
    year: r.year,
  }));

  const plan = getLabPlan(run.planTier);
  if (plan.citationsExport) {
    const exported = await exportCitations(run.resources, 'bibtex');
    if (exported.ok) {
      return {
        observation: JSON.stringify({
          ok: true,
          count: run.citations.length,
          bibtex: exported.value,
          source: 'platform',
        }),
      };
    }
    // Fall through to local BibTeX if platform plan blocks export (402) or is down.
  } else {
    return {
      observation: JSON.stringify({
        ok: false,
        error: freeFenceMessage('citationsExport'),
        preview: localBibtex(run.resources).slice(0, 400),
      }),
    };
  }

  const bib = localBibtex(run.resources);
  return {
    observation: JSON.stringify({
      ok: true,
      count: run.citations.length,
      bibtex: bib,
      source: 'local_fallback',
    }),
  };
}

function submitPrototype(run: LabRun): ToolOutcome {
  const check = checkPrototype(run);
  if (!check.ok) {
    run.submitRefusals += 1;
    if (run.submitRefusals >= 3) {
      run.status = 'needs_input';
      return {
        observation: JSON.stringify({ ok: false, refused: true, feedback: check.feedback, escalate: 'request_human' }),
        needsHuman: true,
      };
    }
    return { observation: JSON.stringify({ ok: false, refused: true, feedback: check.feedback, refusals: run.submitRefusals }) };
  }
  run.stopReason = 'submitted';
  if (run.kind === 'paper') {
    run.status = 'awaiting_signoff';
    return { observation: JSON.stringify({ ok: true, status: 'awaiting_signoff' }), needsHuman: true };
  }
  return { observation: JSON.stringify({ ok: true, status: 'submitted' }) };
}

function requestHuman(run: LabRun, args: Record<string, unknown>): ToolOutcome {
  const reason = String(args.reason ?? 'needs_input');
  if (reason === 'approve_plan' && run.plan) {
    // Waiting for UI to set planApproved on resume.
    run.status = 'needs_input';
    run.stopReason = 'approve_plan';
    return { observation: JSON.stringify({ ok: true, waiting: 'approve_plan' }), needsHuman: true };
  }
  if (reason === 'signoff') {
    run.status = 'awaiting_signoff';
    run.stopReason = 'signoff';
    return { observation: JSON.stringify({ ok: true, waiting: 'signoff' }), needsHuman: true };
  }
  run.status = 'needs_input';
  run.stopReason = reason;
  return { observation: JSON.stringify({ ok: true, waiting: reason }), needsHuman: true };
}

function handoffStudio(run: LabRun): ToolOutcome {
  const plan = getLabPlan(run.planTier);
  if (!plan.studioFilesHandoff) {
    return { observation: JSON.stringify({ ok: false, error: freeFenceMessage('studioFilesHandoff') }) };
  }
  if (run.stopReason !== 'submitted' && run.status !== 'awaiting_signoff' && run.status !== 'done') {
    return { observation: JSON.stringify({ ok: false, error: 'submit_prototype must pass first.' }) };
  }
  return {
    observation: JSON.stringify({
      ok: true,
      handoff: {
        title: run.input.slice(0, 70),
        idea: run.input,
        summary: run.plan?.summary,
        files: run.files,
      },
    }),
  };
}

function finish(run: LabRun, args: Record<string, unknown>): ToolOutcome {
  const abort = Boolean(args.abort);
  if (abort) {
    run.status = 'failed';
    run.stopReason = String(args.reason ?? 'aborted');
    return { observation: JSON.stringify({ ok: true, status: run.status }), terminal: true };
  }
  if (run.status === 'awaiting_signoff' && !args.signedOff) {
    return { observation: JSON.stringify({ ok: false, error: 'Paper run needs human sign-off before finish.' }), needsHuman: true };
  }
  run.status = 'done';
  run.stopReason = run.stopReason ?? 'finished';
  return { observation: JSON.stringify({ ok: true, status: 'done' }), terminal: true };
}

function brief(r: Resource) {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    url: r.url,
    doi: r.doi,
    year: r.year,
    venue: r.venue,
    snippet: r.snippet?.slice(0, 160),
    citationCount: r.citationCount,
  };
}

function upsertResource(run: LabRun, resource: Resource) {
  const idx = run.resources.findIndex((r) => r.id === resource.id || r.url === resource.url);
  if (idx >= 0) run.resources[idx] = { ...run.resources[idx], ...resource };
  else run.resources = [resource, ...run.resources].slice(0, 12);
}

function mergeResources(existing: Resource[], incoming: Resource[]): Resource[] {
  const out = [...existing];
  for (const r of incoming) {
    const idx = out.findIndex((x) => x.id === r.id || x.url === r.url);
    if (idx >= 0) out[idx] = { ...out[idx], ...r };
    else out.push(r);
  }
  return out.slice(0, 12);
}

function escapeBib(s: string): string {
  return s.replace(/[{}]/g, '');
}

function localBibtex(resources: Resource[]): string {
  return resources
    .map((r, i) => {
      const fields = [
        `  title={${escapeBib(r.title)}}`,
        r.authors?.length ? `  author={${escapeBib(r.authors.join(' and '))}}` : '',
        r.year ? `  year={${r.year}}` : '',
        r.doi ? `  doi={${escapeBib(r.doi)}}` : '',
        `  url={${r.url}}`,
        r.venue ? `  journal={${escapeBib(r.venue)}}` : '',
        `  note={Open Idea Lab retrieval}`,
      ]
        .filter(Boolean)
        .join(',\n');
      return `@${r.type === 'paper' ? 'article' : 'misc'}{lab${i},\n${fields}\n}`;
    })
    .join('\n\n');
}

/** Playbook text shipped next to this module. */
export function loadPlaybook(): string {
  try {
    return readFileSync(join(process.cwd(), 'lib/agent/playbook.md'), 'utf8');
  } catch {
    return 'You are the Lab Muse agent. Pick one tool per turn as JSON {"tool","args"}.';
  }
}
