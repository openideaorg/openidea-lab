import type { LabRun } from '../types';

export type PrototypeCheck = { ok: true } | { ok: false; feedback: string };

/** Submit gate — citations ⊆ resources, files present, paper needs verdict. */
export function checkPrototype(run: LabRun): PrototypeCheck {
  if (run.kind === 'photo') return checkPhotoSubmit(run);
  if (!run.files?.length) return { ok: false, feedback: 'No prototype files to submit.' };
  if (run.sandbox && !run.sandbox.ok) {
    return { ok: false, feedback: 'Sandbox last failed. Fix the code or request_human before submit.' };
  }
  if (run.kind === 'paper' && !run.verdict) {
    return { ok: false, feedback: 'Paper runs need judge_paper before submit. Running ≠ reproducing.' };
  }
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
