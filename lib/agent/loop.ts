/**
 * Muse-only agent loop (handbook §2.3 shape).
 *
 * Decide (Muse chooses one tool) → Act (run tool) → Observe → save_progress.
 * No hard-coded happy path inside the loop. Legacy app/flow.tsx remains a
 * fallback demo; this is the product path.
 */

import { overBudget } from '../budget';
import { withUsage } from '../usage';
import { getLabPlan, assertLabProUnderCap } from '../lab-plan';
import { chooseTool } from '../muse-agent';
import { definitions, loadPlaybook, runTool, TOOL_NAMES } from './tools';
import { loadProgress, newRunId, saveProgress } from './progress';
import type { AgentTurnResult, ConsoleRow, LabRun, LabRunKind } from './types';

const MAX_TURNS = Number(process.env.LAB_AGENT_MAX_TURNS) || 15;

function summarize(run: LabRun): string {
  return JSON.stringify(
    {
      id: run.id,
      kind: run.kind,
      status: run.status,
      turn: run.turn,
      planTier: run.planTier,
      hasPlan: !!run.plan,
      planApproved: !!run.planApproved,
      resourceCount: run.resources.length,
      files: run.files.map((f) => f.path),
      fixCount: run.fixCount,
      submitRefusals: run.submitRefusals,
      sandbox: run.sandbox ? { ok: run.sandbox.ok, error: run.sandbox.error?.slice(0, 200) } : null,
      verdict: run.verdict ?? null,
      citations: run.citations.length,
      stopReason: run.stopReason,
      tools: TOOL_NAMES,
    },
    null,
    2,
  );
}

function pushConsole(run: LabRun, phase: ConsoleRow['phase'], text: string, tool?: string) {
  run.console.push({ turn: run.turn, phase, text, tool, at: Date.now() });
}

export function createRun(input: {
  kind: LabRunKind;
  input: string;
  planTier?: 'free' | 'pro';
}): LabRun {
  assertLabProUnderCap();
  const plan = getLabPlan(input.planTier);
  const now = Date.now();
  return {
    id: newRunId(),
    kind: input.kind,
    input: input.input,
    planTier: plan.tier,
    resources: [],
    files: [],
    citations: [],
    usage: [],
    status: 'running',
    turn: 0,
    messages: [{ role: 'user', content: input.input }],
    console: [],
    fixCount: 0,
    submitRefusals: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export async function runAgent(run: LabRun, opts: { maxTurns?: number } = {}): Promise<AgentTurnResult> {
  const budget = Number(opts.maxTurns ?? MAX_TURNS);
  const playbook = loadPlaybook();

  while (run.turn < budget) {
    if (['done', 'failed', 'needs_input', 'needs_client', 'awaiting_signoff', 'paused'].includes(run.status) && run.turn > 0) {
      await saveProgress(run);
      return {
        run,
        needsClientSandbox: run.status === 'needs_client',
        needsHuman: run.status === 'needs_input' || run.status === 'awaiting_signoff',
      };
    }

    const blocked = await overBudget('meta');
    if (blocked) {
      run.status = 'paused';
      run.stopReason = blocked;
      pushConsole(run, 'observe', blocked);
      await saveProgress(run);
      return { run };
    }

    run.turn += 1;
    pushConsole(run, 'plan', `Turn ${run.turn}: Muse choosing tool…`);

    const { result: choicePack, usage } = await withUsage(async () =>
      chooseTool(
        playbook + `\n\nAvailable tools:\n${definitions()
          .map((d) => `- ${d.name}: ${d.description}`)
          .join('\n')}`,
        summarize(run),
        run.messages.map((m) => ({ role: m.role === 'tool' ? 'user' : m.role, content: m.content })),
      ),
    );
    run.usage.push(...usage);

    if (!choicePack.ok) {
      run.status = 'failed';
      run.stopReason = choicePack.error;
      pushConsole(run, 'observe', choicePack.error);
      await saveProgress(run);
      return { run };
    }

    const call = choicePack.value;
    run.messages.push({ role: 'assistant', content: JSON.stringify(call), tool: call.name });
    pushConsole(run, 'act', `${call.name}(${JSON.stringify(call.args).slice(0, 200)})`, call.name);

    const { result: outcome, usage: toolUsage } = await withUsage(async () => runTool(run, call));
    run.usage.push(...toolUsage);

    run.messages.push({ role: 'tool', content: outcome.observation, tool: call.name });
    pushConsole(run, 'observe', outcome.observation.slice(0, 800), call.name);

    if (outcome.needsClientSandbox) {
      run.status = 'needs_client';
      await saveProgress(run);
      return { run, needsClientSandbox: true };
    }
    if (outcome.needsHuman) {
      if (run.status === 'running') run.status = 'needs_input';
      await saveProgress(run);
      return { run, needsHuman: true };
    }
    if (outcome.terminal) {
      await saveProgress(run);
      return { run };
    }

    await saveProgress(run);
  }

  // Last-turn nudge: if still open, force a finish attempt observation.
  run.messages.push({
    role: 'user',
    content: 'Turn budget reached. Call cite_sources and submit_prototype or finish next.',
  });
  run.status = 'paused';
  run.stopReason = 'turn_limit';
  pushConsole(run, 'observe', 'Turn limit reached.');
  await saveProgress(run);
  return { run };
}

/** Resume after HITL / client sandbox observation. */
export async function resumeRun(
  id: string,
  patch: {
    planApproved?: boolean;
    signedOff?: boolean;
    sandbox?: LabRun['sandbox'];
    humanNote?: string;
  },
): Promise<AgentTurnResult> {
  const run = await loadProgress(id);
  if (!run) throw new Error(`Unknown run ${id}`);

  if (patch.planApproved) {
    run.planApproved = true;
    run.messages.push({ role: 'user', content: 'Human approved the plan. Continue.' });
    pushConsole(run, 'observe', 'Human approved plan.');
    if (run.status === 'needs_input') run.status = 'running';
  }
  if (patch.signedOff) {
    run.messages.push({ role: 'user', content: 'Human signed off. You may finish.' });
    pushConsole(run, 'observe', 'Human signed off.');
    run.status = 'running';
    run.stopReason = 'submitted';
  }
  if (patch.sandbox) {
    run.sandbox = patch.sandbox;
    run.pendingTool = undefined;
    run.messages.push({
      role: 'tool',
      content: JSON.stringify({ tool: 'run_sandbox', result: patch.sandbox }),
      tool: 'run_sandbox',
    });
    pushConsole(run, 'observe', JSON.stringify(patch.sandbox).slice(0, 800), 'run_sandbox');
    if (run.status === 'needs_client') run.status = 'running';
  }
  if (patch.humanNote) {
    run.messages.push({ role: 'user', content: patch.humanNote });
    pushConsole(run, 'observe', patch.humanNote);
    if (run.status === 'needs_input') run.status = 'running';
  }

  await saveProgress(run);
  return runAgent(run);
}

export async function getRun(id: string): Promise<LabRun | null> {
  return loadProgress(id);
}
