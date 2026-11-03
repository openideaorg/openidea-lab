import type { LabRun } from '../types';

export type PrototypeCheck = { ok: true } | { ok: false; feedback: string };

/** Submit gate — citations ⊆ resources, files present, paper needs evidence + verdict. */
export function checkPrototype(run: LabRun): PrototypeCheck {
  if (run.kind === 'photo') return checkPhotoSubmit(run);
  if (run.kind === 'paper') return checkPaperSubmit(run);
  if (!run.files?.length) return { ok: false, feedback: 'No prototype files to submit.' };
  if (run.sandbox && !run.sandbox.ok) {
    return { ok: false, feedback: 'Sandbox last failed. Fix the code or request_human before submit.' };
  }
  if (!run.citations.length) {
    return { ok: false, feedback: 'Call cite_sources before submit so the export is defensible.' };
  }
  return checkCitations(run);
}

/**
 * Paper submit gate — the non-toy check a 4×4 attention print cannot pass.
 * The draft prompt requires a CHECK line and a null baseline in the output,
 * and the wonder verdict caps shape-without-proof at partial; this gate makes
 * the same rule structural so a run cannot be submitted on vibes. Each refusal
 * names the exact line to add, so the fix loop converges instead of spinning.
 */
function checkPaperSubmit(run: LabRun): PrototypeCheck {
  if (!run.files?.length) return { ok: false, feedback: 'No prototype files to submit.' };
  if (!run.sandbox || !run.sandbox.ok) {
    return {
      ok: false,
      feedback: 'Paper runs need a passing sandbox run before submit (run_sandbox first). Running is not reproducing.',
    };
  }
  const output = run.sandbox.output ?? '';
  if (!/^CHECK:\s*pass/im.test(output)) {
    return {
      ok: false,
      feedback:
        'Sandbox output has no "CHECK: pass" line with the measured number. A script that merely prints weights proves nothing — add the claim check to reproduce.py and re-run.',
    };
  }
  if (!/baseline|shuffl|permut|\bcontrol\b|\bnull\b/i.test(output)) {
    return {
      ok: false,
      feedback:
        'Sandbox output names no null baseline (shuffled/permuted control). A claim passes only by beating a baseline outside the standard error — print both numbers and re-run.',
    };
  }
  if (!run.verdict) {
    return { ok: false, feedback: 'Paper runs need judge_paper before submit. Running ≠ reproducing.' };
  }
  if (!run.citations.length) {
    return { ok: false, feedback: 'Call cite_sources before submit so the export is defensible.' };
  }
  return checkCitations(run);
}

function checkCitations(run: LabRun): PrototypeCheck {
  const urls = new Set(run.resources.map((r) => r.url));
  const bad = run.citations.filter((c) => !urls.has(c.url));
  if (bad.length) {
    return {
      ok: false,
      feedback: `Citations must come from retrieved resources. Unknown: ${bad.map((c) => c.url).join(', ')}`,
    };
  }
  if (run.kind === 'idea' && !run.plan) {
    return { ok: false, feedback: 'Idea runs need a plan before submit.' };
  }
  return { ok: true };
}

/** Photo runs ship a parts list, not code: no files, no sandbox, no verdict. */
function checkPhotoSubmit(run: LabRun): PrototypeCheck {
  if (!run.partsMarkdown) return { ok: false, feedback: 'Photo runs need segment_photo before submit (no parts list yet).' };
  if (!run.citations.length) {
    return { ok: false, feedback: 'Call cite_sources before submit so the export is defensible.' };
  }
  const urls = new Set(run.resources.map((r) => r.url));
  const bad = run.citations.filter((c) => !urls.has(c.url));
  if (bad.length) {
    return {
      ok: false,
      feedback: `Citations must come from retrieved resources. Unknown: ${bad.map((c) => c.url).join(', ')}`,
    };
  }
  return { ok: true };
}
