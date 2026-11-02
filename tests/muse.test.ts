import { afterEach, describe, expect, it } from 'vitest';
import { claimFromReadme, modelFor, parseVerdict, sanitizeFiles } from '@/lib/muse';

const saved = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

describe('modelFor', () => {
  it('defaults to the contributor tier for cheap explore/edit calls', () => {
    delete process.env.META_MODEL;
    delete process.env.META_MODEL_HEAVY;
    delete process.env.META_MODEL_WONDER;
    // The tiers must differ by construction so a misconfiguration (all three
    // the same expensive model) is visible here.
    expect(modelFor('contributor')).toContain('contributor');
    expect(modelFor('heavy')).not.toBe(modelFor('contributor'));
    expect(modelFor('wonder')).not.toBe(modelFor('contributor'));
  });

  it('falls back to META_MODEL when a tier override is unset', () => {
    process.env.META_MODEL = 'custom';
    delete process.env.META_MODEL_HEAVY;
    expect(modelFor('heavy')).toBe('custom');
  });
});

describe('claimFromReadme', () => {
  it('pulls the testable claim out of the generated README', () => {
    const files = [
      { path: 'reproduce.py', content: 'print(1)' },
      { path: 'README.md', content: '# Repro\n\nClaim: test error peaks at the interpolation threshold then falls.\n\nSetup: synthetic.' },
    ];
    expect(claimFromReadme(files)).toContain('peaks at the interpolation threshold');
  });

  it('returns empty when no claim line exists (caller falls back to the paper text)', () => {
    expect(claimFromReadme([{ path: 'README.md', content: '# Repro\n\nNo claim here.' }])).toBe('');
    expect(claimFromReadme([])).toBe('');
  });
});

describe('parseVerdict', () => {
  it('keeps a well-formed verdict with its follow-up check', () => {
    const r = parseVerdict(JSON.stringify({ verdict: 'partial', reason: 'Peak is right but no baseline.', missing: 'Add the shuffled-label baseline.' }));
    expect(r).toEqual({ ok: true, value: { verdict: 'partial', reason: 'Peak is right but no baseline.', missing: 'Add the shuffled-label baseline.' } });
  });

  it('drops a blank missing line so matches stays clean', () => {
    const r = parseVerdict(JSON.stringify({ verdict: 'matches', reason: 'CHECK: pass, 0.41 vs baseline 0.25.', missing: '' }));
    expect(r).toEqual({ ok: true, value: { verdict: 'matches', reason: 'CHECK: pass, 0.41 vs baseline 0.25.' } });
  });

  it('rejects unknown verdicts, empty reasons and bad JSON instead of rendering them', () => {
    expect(parseVerdict(JSON.stringify({ verdict: 'maybe', reason: 'x' })).ok).toBe(false);
    expect(parseVerdict(JSON.stringify({ verdict: 'no', reason: '  ' })).ok).toBe(false);
    expect(parseVerdict('not json').ok).toBe(false);
  });
});
describe('sanitizeFiles', () => {
  it('passes normal model output through unchanged', () => {
    const files = [{ path: 'src/App.tsx', content: 'export default 1' }];
    expect(sanitizeFiles(files)).toEqual({ ok: true, value: files });
  });

  it('rejects paths that escape the project', () => {
    for (const path of ['../evil.ts', '/etc/passwd', 'a/../../b.ts', '']) {
      const r = sanitizeFiles([{ path, content: 'x' }]);
      expect(r.ok).toBe(false);
    }
  });

  it('rejects empty lists and oversized files the browser runner would choke on', () => {
    expect(sanitizeFiles([]).ok).toBe(false);
    expect(sanitizeFiles([{ path: 'big.ts', content: 'x'.repeat(60_001) }]).ok).toBe(false);
  });
});
