#!/usr/bin/env node
/**
 * Headless Chrome screenshots of /demo/paid steps → media dir.
 * Usage: node scripts/capture-paid-demo.mjs --base http://127.0.0.1:3000 --out /path/to/media/paid-lab-demo
 */

import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
function flag(name, fallback = '') {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

const base = flag('base', 'http://127.0.0.1:3000').replace(/\/$/, '');
const out = resolve(flag('out', './paid-lab-demo-out'));
mkdirSync(out, { recursive: true });

const steps = [
  { id: 'paste', file: '01-paste-paper.png' },
  { id: 'console', file: '02-console-loop.png' },
  { id: 'approve', file: '03-approve-plan.png' },
  { id: 'sandbox', file: '04-sandbox-toy.png' },
  { id: 'bibtex', file: '05-pro-bibtex.png' },
  { id: 'paid', file: '06-paid-end.png' },
];

const chrome =
  process.env.CHROME_PATH ||
  ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/local/bin/google-chrome'].find((p) =>
    existsSync(p),
  );

if (!chrome) {
  console.error('No Chrome found');
  process.exit(1);
}

for (const step of steps) {
  const url = `${base}/demo/paid?step=${step.id}`;
  const dest = join(out, step.file);
  // Chrome headless screenshot
  const r = spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--window-size=1440,1600',
      `--screenshot=${dest}`,
      '--virtual-time-budget=8000',
      url,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0 || !existsSync(dest)) {
    console.error(`Failed ${step.id}`, r.stderr || r.stdout);
    process.exit(1);
  }
  console.log('wrote', dest);
}

// Simple one-page PDF via Chrome print
const pdfPath = join(out, '07-paid-end-state.pdf');
try {
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--print-to-pdf=${pdfPath}`,
      '--no-pdf-header-footer',
      `${base}/demo/paid?step=paid`,
    ],
    { encoding: 'utf8' },
  );
  console.log('wrote', pdfPath);
} catch (e) {
  console.warn('PDF capture failed', e.message);
  writeFileSync(join(out, '07-paid-end-state.txt'), `PDF failed; see PNGs. Paid end URL: ${base}/demo/paid?step=paid\n`);
}

writeFileSync(
  join(out, 'manifest.json'),
  JSON.stringify(
    {
      base,
      capturedAt: new Date().toISOString(),
      files: [...steps.map((s) => s.file), '07-paid-end-state.pdf'],
    },
    null,
    2,
  ),
);
