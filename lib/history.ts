/**
 * Saved runs, kept in this browser (localStorage).
 *
 * Nothing leaves the machine: Lab has no accounts, so there is no server-side
 * place to keep a person's work. The trade-off is that runs are per browser and
 * disappear if site data is cleared; "Download" gives a file that does not.
 * Keeps the newest MAX runs and sheds figures first when the browser quota is hit.
 */

import type { LabelledPart, Verdict } from './muse';
import type { Plan, GeneratedFile } from './muse';
import type { Resource } from './openidea';

export type RunKind = 'idea' | 'paper' | 'photo';

export interface SavedRun {
  id: string;
  kind: RunKind;
  title: string;
  createdAt: number;
  /** The idea or abstract the user typed; for photos, a note. */
  input: string;
  plan?: Plan;
  files?: GeneratedFile[];
  /** PNG data URLs from a paper run. */
  figures?: string[];
  /** Paper run: the one testable sentence the notebook checked (paper-ingest handoff). */
  claim?: string;
  /** Paper run: does the output support the paper's claim? */
  verdict?: Verdict;
  /**
   * Paper run: the human's sign-off on the machine verdict. The HITL stamp:
   * raw Claude chat keeps no record of what the researcher accepted, Lab does,
   * and it travels into the Studio handoff and the BibTeX note.
   */
  signoff?: { decision: 'approved' | 'challenged'; at: number };
  /** Idea run: the Studio project this was sent to, if any. */
  studioUrl?: string;
  /** Photo flow: the written parts list and the named parts. */
  markdown?: string;
  parts?: LabelledPart[];
  context?: Resource[];
}

export type NewRun = Omit<SavedRun, 'id' | 'createdAt'>;

const KEY = 'openidea-lab:runs';
const MAX = 20;

function read(): SavedRun[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedRun[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: SavedRun[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export const listRuns = (): SavedRun[] => read().sort((a, b) => b.createdAt - a.createdAt);
export const getRun = (id: string): SavedRun | undefined => read().find((r) => r.id === id);

export function deleteRun(id: string): void {
  write(read().filter((r) => r.id !== id));
}

/**
 * Patch a saved run in place (keeps its id). The Studio button stamps the
 * project URL this way; the old delete + re-save minted a new id and broke
 * the "History → run → Studio link" round trip.
 */
export function updateRun(id: string, patch: Partial<SavedRun>): SavedRun | null {
  const list = read();
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const next = { ...list[i], ...patch, id, createdAt: list[i].createdAt };
  list[i] = next;
  return write(list) ? next : null;
}

/** Returns the saved run, or null when the browser refused (private mode, quota). */
export function saveRun(run: NewRun): SavedRun | null {
  const saved: SavedRun = { ...run, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now() };
  let list = [saved, ...read()].slice(0, MAX);
  if (write(list)) return saved;

  // Over quota: drop figures from the older runs, then from this one, then the oldest runs.
  list = list.map((r, i) => (i === 0 ? r : { ...r, figures: undefined }));
  if (write(list)) return saved;
  saved.figures = undefined;
  list[0] = saved;
  while (list.length > 1 && !write(list)) list = list.slice(0, -1);
  return write(list) ? saved : null;
}

export function runToMarkdown(run: SavedRun): string {
  const out: string[] = [`# ${run.title}`, '', `_${run.kind} run · ${new Date(run.createdAt).toLocaleString()} · OpenIdea Lab_`, '', '## Input', '', run.input];
  if (run.plan) {
    out.push('', '## Plan', '', run.plan.summary, '', `**Buildable:** ${run.plan.buildable ? 'yes' : 'not yet'}`);
    if (run.plan.exists.length) out.push('', '**What exists**', ...run.plan.exists.map((x) => `- ${x}`));
    if (run.plan.missing.length) out.push('', '**What is missing**', ...run.plan.missing.map((x) => `- ${x}`));
    if (run.plan.steps.length) out.push('', '**Steps**', ...run.plan.steps.map((x, i) => `${i + 1}. ${x}`));
  }
  if (run.claim) out.push('', '## Claim tested', '', run.claim);
  if (run.verdict) {
    out.push('', '## Verdict', '', `**${run.verdict.verdict}** — ${run.verdict.reason}`);
    if (run.verdict.missing) out.push('', `To strengthen: ${run.verdict.missing}`);
  }
  if (run.signoff) out.push('', `**Researcher sign-off:** ${run.signoff.decision} (${new Date(run.signoff.at).toLocaleString()})`);
  if (run.studioUrl) out.push('', `Opened in App Studio: ${run.studioUrl}`);
  if (run.markdown) out.push('', '## Parts list', '', run.markdown);
  if (run.context?.length) out.push('', '## Related open resources', '', ...run.context.map((r) => `- [${r.type}] [${r.title}](${r.url})`));
  for (const f of run.files ?? []) out.push('', `## ${f.path}`, '', '```', f.content, '```');
  return out.join('\n') + '\n';
}

/**
 * BibTeX for the open resources a run used — the citing artifact raw Claude
 * chat does not keep. Pure string building from the saved context, so it
 * costs nothing and is unit-testable. Returns '' when the run saved no
 * context, so callers can hide the button instead of copying an empty file.
 */
export function runToBibtex(run: Pick<SavedRun, 'kind' | 'claim' | 'context'>): string {
  const resources = run.context ?? [];
  if (!resources.length) return '';
  // BibTeX braces must balance; strip them rather than escape, and keep keys
  // to alphanumerics so every .bib parser accepts them.
  const clean = (s: string) => s.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return resources
    .map((r, i) => {
      const slug = clean(r.title).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || `source${i + 1}`;
      const note = [`OpenIdea Lab ${run.kind} run`, run.claim ? `tests: ${clean(run.claim).slice(0, 200)}` : '', `[${r.type}]`]
        .filter(Boolean)
        .join('; ');
      return `@misc{lab:${slug}${i > 0 ? i + 1 : ''},\n  title={${clean(r.title)}},\n  url={${r.url}},\n  note={${note}}\n}`;
    })
    .join('\n\n');
}
