/**
 * Tool registry — handbook pattern: definitions() + run().
 * LLM reasoning tools use Muse only (via lib/muse.ts + lib/muse-agent.ts).
 * Baseten SAM remains optional and is not registered on the Muse MVP path.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  search,
  resolvePaper,
  extractPaper,
  exportCitations,
  detectPaperId,
  type Resource,
} from '../../openidea';
import { neighbourhood, describeGraph } from '../../graph';
import { draftNotebook, draftPrototype, planIdea, type Plan } from '../../muse';
import { museFix, museRank, museVerdict } from '../../muse-agent';
import { getLabPlan, freeFenceMessage } from '../../lab-plan';
import { checkPlan } from '../verify/plan';
import { checkPrototype } from '../verify/prototype';
import { checkClaimsShape } from '../verify/claims';
import type { LabRun, ToolCall } from '../types';

export const TOOL_NAMES = [
  'resolve_paper',
  'search_open',
  'expand_graph',
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

export function definitions(): { name: string; description: string }[] {
  return [
    { name: 'resolve_paper', description: 'Resolve arXiv/DOI and extract abstract/text (e.g. 1706.03762)' },
    { name: 'search_open', description: 'Search openidea.world and Muse-rank results' },
    { name: 'expand_graph', description: 'Expand knowledge-graph neighbourhood for resources' },
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
  const detected = detectPaperId(run.input);
  const input = {
    arxiv: typeof args.arxiv === 'string' ? args.arxiv : detected?.arxiv,
    doi: typeof args.doi === 'string' ? args.doi : detected?.doi,
    url: typeof args.url === 'string' ? args.url : undefined,
    mode: args.mode === 'pdf' ? ('pdf' as const) : ('abstract' as const),
  };
  if (!input.arxiv && !input.doi && !input.url) {
    return {
      observation: JSON.stringify({
        ok: false,
        error: 'Provide arxiv, doi, or url (e.g. arxiv:1706.03762).',
      }),
    };
  }

  const extracted = await extractPaper(input);
  if (!extracted.ok) {
    // Fall back to metadata-only resolve so search can still proceed.
    const resolved = await resolvePaper(input);
    if (!resolved.ok) return { observation: JSON.stringify(resolved) };
    upsertResource(run, resolved.value.resource);
    return {
      observation: JSON.stringify({
        ok: true,
        resource: brief(resolved.value.resource),
        pdfUrl: resolved.value.pdfUrl,
        textChars: 0,
        note: 'extract failed; metadata only',
        extractError: extracted.error,
      }),
    };
  }

  upsertResource(run, extracted.value.resource);
  // Prefer extracted text as the paper-run input when the user only pasted an id.
  if (extracted.value.text && (run.input.length < 200 || detectPaperId(run.input))) {
    run.input = [
      extracted.value.resource.title,
      extracted.value.resource.authors?.join(', '),
      extracted.value.text,
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 60_000);
  }

  return {
    observation: JSON.stringify({
      ok: true,
      resource: brief(extracted.value.resource),
      pdfUrl: extracted.value.pdfUrl,
      source: extracted.value.source,
      truncated: extracted.value.truncated,
      textChars: extracted.value.text.length,
      sections: extracted.value.sections.map((s) => s.heading),
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

async function setPlan(run: LabRun): Promise<ToolOutcome> {
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
  const files = await draftNotebook(run.input, run.resources);
  if (!files.ok) return { observation: JSON.stringify(files) };
  run.files = files.value;
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
  const v = await museVerdict(run.input.slice(0, 6000), readme.slice(0, 6000), output.slice(-6000));
  if (!v.ok) return { observation: JSON.stringify(v) };
  const shaped = checkClaimsShape(v.value);
  if (!shaped.ok) return { observation: JSON.stringify({ ok: false, feedback: shaped.feedback }) };
  run.verdict = shaped.verdict;
  return { observation: JSON.stringify({ ok: true, verdict: run.verdict }) };
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
