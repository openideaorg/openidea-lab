/**
 * Tool registry — handbook pattern: definitions() + run().
 * LLM reasoning tools use Muse only (via lib/muse.ts + lib/muse-agent.ts).
 * Baseten SAM remains optional and is not registered on the Muse MVP path.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { search } from '../../openidea';
import { neighbourhood, describeGraph } from '../../graph';
import { draftNotebook, draftPrototype, planIdea, type Plan } from '../../muse';
import { museFix, museRank, museVerdict } from '../../muse-agent';
import { getLabPlan, freeFenceMessage } from '../../lab-plan';
import { checkPlan } from '../verify/plan';
import { checkPrototype } from '../verify/prototype';
import { checkClaimsShape } from '../verify/claims';
import type { LabRun, ToolCall } from '../types';

export const TOOL_NAMES = [
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
    { name: 'search_open', description: 'Search openidea.world and Muse-rank results' },
    { name: 'expand_graph', description: 'Expand knowledge-graph neighbourhood for resources' },
    { name: 'set_plan', description: 'Muse write a structural plan (verified)' },
    { name: 'draft_code', description: 'Muse draft prototype / notebook files' },
    { name: 'run_sandbox', description: 'Pause for client browser sandbox (WebContainer/Pyodide)' },
    { name: 'fix_code', description: 'Muse patch files from last sandbox error (max 3)' },
    { name: 'judge_paper', description: 'Muse verdict: output vs paper claim' },
    { name: 'cite_sources', description: 'Build citations from retrieved resources only' },
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

async function searchOpen(run: LabRun, args: Record<string, unknown>): Promise<ToolOutcome> {
  const q = String(args.query ?? run.input).slice(0, 500);
  const found = await search(q, { limit: 20 });
  if (!found.ok) return { observation: JSON.stringify(found) };
  const ranked = await museRank(q, found.value, 6);
  if (!ranked.ok) {
    run.resources = found.value.slice(0, 6);
    return { observation: JSON.stringify({ ok: true, resources: run.resources, note: 'rank skipped', rankError: ranked.error }) };
  }
  run.resources = ranked.value;
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
    const plan: Plan = {
      summary: `Reproduce one key claim from the paper on small synthetic data.`,
      buildable: true,
      exists: run.resources.slice(0, 3).map((r) => r.title),
      missing: ['Confirmed figure/table id from full PDF if paste is truncated'],
      steps: ['Identify one claim', 'Draft Pyodide script with CHECK line', 'Run + judge_paper', 'Cite + submit'],
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

function citeSources(run: LabRun): ToolOutcome {
  if (!run.resources.length) return { observation: JSON.stringify({ ok: false, error: 'No resources to cite.' }) };
  run.citations = run.resources.map((r) => ({ title: r.title, url: r.url, type: r.type }));
  const bib = run.citations
    .map((c, i) => `@misc{lab${i},\n  title={${escapeBib(c.title)}},\n  url={${c.url}},\n  note={Open Idea Lab retrieval}\n}`)
    .join('\n\n');
  return { observation: JSON.stringify({ ok: true, count: run.citations.length, bibtex: bib }) };
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

function brief(r: { id: string; type: string; title: string; url: string }) {
  return { id: r.id, type: r.type, title: r.title, url: r.url };
}

function escapeBib(s: string): string {
  return s.replace(/[{}]/g, '');
}

/** Playbook text shipped next to this module. */
export function loadPlaybook(): string {
  try {
    return readFileSync(join(process.cwd(), 'lib/agent/playbook.md'), 'utf8');
  } catch {
    return 'You are the Lab Muse agent. Pick one tool per turn as JSON {"tool","args"}.';
  }
}
