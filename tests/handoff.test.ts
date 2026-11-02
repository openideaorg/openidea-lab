import { afterEach, describe, expect, it, vi } from 'vitest';
import { openInStudio, saveToWorkspaceLink, studioDescription } from '@/lib/handoff';

describe('hand-off', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes a Studio description with the idea, plan and file list, under the cap', () => {
    const d = studioDescription({
      title: 'Soil sensor',
      idea: 'A soil sensor for farmers',
      summary: 'Buildable with an ESP32.',
      buildable: true,
      exists: ['ESP32 soil probe'],
      missing: ['Hindi offline alerts'],
      steps: ['Search', 'Draft', 'Run', 'Hand off'],
      files: [{ path: 'package.json', content: '{}' }, { path: 'src/App.tsx', content: 'x'.repeat(5000) }],
    });
    expect(d).toContain('Idea: A soil sensor for farmers');
    expect(d).toContain('Plan: Buildable with an ESP32.');
    expect(d).toContain('Build steps: Search');
    expect(d).toContain('package.json');
    expect(d.length).toBeLessThanOrEqual(2000);
  });

  it('carries a paper run judgement (claim, verdict, sign-off) for Studio', () => {
    const d = studioDescription({
      title: 'Double descent',
      idea: 'Paper reproduction. Test error peaks at n=d then falls.',
      claim: 'Test error peaks at n=d then falls.',
      verdictLine: 'partial — shape right, baseline missing.',
      signoffLine: 'challenged',
      files: [{ path: 'reproduce.py', content: 'print(1)' }],
    });
    expect(d).toContain('Claim tested: Test error peaks');
    expect(d).toContain('Verdict: partial');
    expect(d).toContain('Researcher sign-off: challenged');
    expect(d.length).toBeLessThanOrEqual(2000);
  });

  it('links Save to Workspace with the content pre-filled', () => {
    const h = saveToWorkspaceLink('Parts list', '# hello');
    expect(h.url).toContain('openidea.world/workspaces?save=1');
    expect(h.url).toContain('title=Parts+list');
  });

  it('verifies Studio filesWritten round-trip for Transformer prototype files', async () => {
    const files = [
      { path: 'reproduce.py', content: 'print("attention")\n' },
      { path: 'README.md', content: '# Attention Is All You Need\n' },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/studio/projects/') && !String(url).endsWith('/studio/projects')) {
          return new Response(JSON.stringify({ project: { id: 'p1' }, files: files.map((f) => ({ path: f.path })) }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({
            project: { id: 'p1' },
            filesWritten: 2,
            url: 'https://openidea.world/studio?project=p1',
          }),
          { status: 201 },
        );
      }),
    );

    const out = await openInStudio(
      { title: 'Transformer Lab', idea: 'arXiv:1706.03762', files },
      'oi_live_test',
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.projectId).toBe('p1');
    expect(out.value.filesWritten).toBe(2);
    expect(out.value.filesVerified).toBe(true);
  });
});
