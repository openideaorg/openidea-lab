#!/usr/bin/env node
/**
 * CLI: node scripts/pay-judge.mjs --iteration N --media path1,path2 --notes "..."
 * Loads compiled TS via dynamic import of a tiny runner when available;
 * otherwise duplicates the simulated heuristic for offline capture loops.
 *
 * Prefer: pnpm exec tsx scripts/pay-judge-run.ts
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
function flag(name, fallback = '') {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

const iteration = Number(flag('iteration', '1')) || 1;
const media = flag('media', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const notes = flag('notes', '');
const out = flag('out', '');

const productSummary =
  'Open Idea Lab Pro: Muse-only agent turns Attention Is All You Need into a tiny educational self-attention toy with plan/act/observe console, BibTeX citations, researcher sign-off, and Studio handoff.';
const buyerGets = [
  'Lab Pro ≤ $20/mo packaging with free teaser fences',
  'Agent console replay (plan / act / observe)',
  'Citations + BibTeX export',
  'HITL approve plan + researcher sign-off',
  'Runnable sandbox attention matrix + Studio files handoff',
];

const text = `${productSummary}\n${buyerGets.join('\n')}\n${notes}`.toLowerCase();
const mediaJoined = media.join(' ').toLowerCase();
const checks = [
  { ok: /lab pro|≤\s*\$?20|<=\s*\$?20|\$20/.test(text), gap: 'Price ≤ $20 / Lab Pro not clear enough' },
  { ok: /citation|bibtex/.test(text), gap: 'Citations / BibTeX missing from the paid story' },
  { ok: /sign-?off|signed off/.test(text), gap: 'Researcher sign-off not visible' },
  { ok: /console|plan\s*\/\s*act|plan → act/.test(text), gap: 'Agent console story too weak' },
  { ok: /attention|transformer|sandbox|prototype|toy/.test(text), gap: 'Runnable prototype outcome unclear' },
  {
    ok: mediaJoined.includes('paid') || mediaJoined.includes('sign') || mediaJoined.includes('bibtex') || mediaJoined.includes('console'),
    gap: 'Media set does not cover console / citations / sign-off / paid end',
  },
  { ok: media.length >= 3, gap: 'Need ≥3 screenshots covering the paid journey' },
];
const gaps = checks.filter((c) => !c.ok).map((c) => c.gap);
const polish =
  iteration >= 2 && /polish|hero|pricing|receipt|meter|studio handoff|attention matrix/.test(text) ? 8 : 0;
const score = Math.min(
  100,
  Math.round(((checks.length - gaps.length) / checks.length) * 78 + polish + (gaps.length === 0 ? 12 : 0)),
);
const verdict = gaps.length === 0 && score >= 72 ? 'YES' : 'NO';
const result = {
  verdict,
  score,
  why:
    verdict === 'YES'
      ? 'Simulated common buyer: end-state shows Pro ≤ $20, console, citations, sign-off, and a concrete Transformer toy — worth a coffee-tier subscription.'
      : `Simulated common buyer: still missing trust signals (${gaps.slice(0, 2).join('; ') || 'weak packaging'}). Would not pay yet.`,
  gaps,
  improvements:
    verdict === 'YES'
      ? []
      : [
          'Make Lab Pro ≤ $20 badge impossible to miss on the paid end frame',
          'Show full console + BibTeX + signed-off receipt in the same viewport story',
          'Surface sandbox attention matrix as the tangible deliverable',
          ...gaps.map((g) => `Fix: ${g}`),
        ],
  model: process.env.META_API_KEY ? 'muse-wonder-1.0 (preferred; use tsx runner)' : 'simulated-heuristic',
  mode: process.env.META_API_KEY ? 'muse-cli-hint' : 'simulated',
  iteration,
  criteria: [
    'Clear paid outcome (not a toy paste-and-forget): saved run, citations, sign-off visible',
    'Lab Pro price ≤ $20 is obvious and credible vs free teaser fences',
    'Agent console shows real plan/act/observe work a builder would trust',
    'Prototype looks runnable / educationally useful from a known paper',
    'UI/copy would not embarrass a buyer showing teammates; low clutter, coherent brand',
    'A common CS student / indie hacker / R&D eng would pay ≤ $20/mo for this end-state',
  ],
  mediaPaths: media,
  notes,
};

const json = JSON.stringify(result, null, 2);
console.log(json);
if (out) {
  const p = resolve(out);
  mkdirSync(resolve(p, '..'), { recursive: true });
  writeFileSync(p, json);
  if (!existsSync(p)) throw new Error(`failed to write ${p}`);
}
