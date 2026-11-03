import { describe, expect, it } from 'vitest';
import { parseRunImport, runToBibtex, runToMarkdown, type SavedRun } from '@/lib/history';

const run = (over: Partial<SavedRun> = {}): SavedRun => ({
  id: 'r1',
  kind: 'paper',
  title: 'Double descent',
  createdAt: 0,
  input: 'abstract',
  ...over,
});

describe('runToBibtex', () => {
  it('cites every saved resource with unique keys', () => {
    const bib = runToBibtex(
      run({
        claim: 'Test error peaks at n=d then falls.',
        context: [
          { id: 'a', type: 'paper', title: 'Reconciling modern machine-learning practice', url: 'https://arxiv.org/abs/1812.11118' },
          { id: 'b', type: 'code', title: 'Reconciling modern machine-learning practice', url: 'https://github.com/x/y' },
        ],
      }),
    );
    expect(bib).toContain('@misc{lab:reconcilingmodernmachine');
    expect(bib).toContain('https://arxiv.org/abs/1812.11118');
    expect(bib).toContain('tests: Test error peaks');
    // Same title twice still gives two distinct keys.
    const keys = bib.split('\n').filter((l) => l.startsWith('@misc{'));
    expect(keys.length).toBe(2);
    expect(new Set(keys).size).toBe(2);
  });

  it('strips braces so entries always parse, and returns empty with no context', () => {
    const bib = runToBibtex(run({ context: [{ id: 'a', type: 'paper', title: 'A {tricky} title', url: 'https://x' }] }));
    expect(bib).toContain('title={A tricky title}');
    expect(runToBibtex(run({ context: [] }))).toBe('');
    expect(runToBibtex(run({}))).toBe('');
  });
});

describe('runToMarkdown', () => {
  it('keeps the researcher sign-off next to the verdict', () => {
    const md = runToMarkdown(
      run({
        verdict: { verdict: 'partial', reason: 'Shape right, baseline missing.', missing: 'Add the shuffled baseline.' },
        signoff: { decision: 'challenged', at: 0 },
      }),
    );
    expect(md).toContain('**partial**');
    expect(md).toContain('To strengthen: Add the shuffled baseline.');
    expect(md).toContain('**Researcher sign-off:** challenged');
  });

  it('carries the scale line so an exported run never reads as the paper\'s own numbers', () => {
    const md = runToMarkdown(run({ scale: 'paper n=10k; this run n=30, ~3 s CPU. Cannot show the plateau.' }));
    expect(md).toContain('## Scale (this run vs the paper)');
    expect(md).toContain('this run n=30');
  });
});

describe('parseRunImport', () => {
  it('accepts an exported run and drops the old id', () => {
    const back = parseRunImport(JSON.stringify(run({ id: 'old', createdAt: 123 })));
    expect(back.kind).toBe('paper');
    expect(back.title).toBe('Double descent');
    expect(back).not.toHaveProperty('id');
  });

  it('rejects garbage with a plain message', () => {
    expect(() => parseRunImport('not json')).toThrow('not valid JSON');
    expect(() => parseRunImport('{"kind":"video","title":"x","input":"y"}')).toThrow('idea, paper or photo');
    expect(() => parseRunImport('{"kind":"paper"}')).toThrow('title and input');
  });
});
