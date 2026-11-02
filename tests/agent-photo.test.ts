import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LabRun } from '@/lib/agent/types';

const saved = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  vi.resetModules();
});

function photoRun(over: Partial<LabRun> = {}): LabRun {
  return {
    id: 'photo1',
    kind: 'photo',
    input: 'bench power supply',
    planTier: 'free',
    resources: [],
    files: [],
    citations: [],
    usage: [],
    status: 'running',
    turn: 1,
    messages: [],
    console: [],
    fixCount: 0,
    submitRefusals: 0,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

/** Fresh module graph so lib/env.ts snapshots the stubbed keys. */
async function loadTools() {
  return await import('@/lib/agent/tools/index');
}

describe('segment_photo registry', () => {
  it('is registered with a photo-only description', async () => {
    const { TOOL_NAMES, definitions } = await loadTools();
    expect(TOOL_NAMES).toContain('segment_photo');
    const def = definitions().find((d) => d.name === 'segment_photo');
    expect(def?.description).toMatch(/photo/i);
  });

  it('asks for a photo via request_human when the run has none', async () => {
    const { runTool } = await loadTools();
    const run = photoRun();
    const out = await runTool(run, { name: 'segment_photo', args: {} });
    expect(out.needsHuman).toBe(true);
    expect(out.observation).toMatch(/photo_upload/);
    expect(run.status).toBe('needs_input');
  });

  it('rejects non-data URLs and oversized photos before spending', async () => {
    const { runTool, MAX_PHOTO_CHARS } = await loadTools();
    const bad = await runTool(photoRun(), { name: 'segment_photo', args: { image: 'https://example.com/p.jpg' } });
    expect(bad.observation).toMatch(/data:image/);
    const big = await runTool(photoRun(), {
      name: 'segment_photo',
      args: { image: `data:image/jpeg;base64,${'x'.repeat(MAX_PHOTO_CHARS)}` },
    });
    expect(big.observation).toMatch(/shrink it/);
  });

  it('degrades gracefully without Baseten keys', async () => {
    vi.stubEnv('BASETEN_API_KEY', '');
    vi.stubEnv('BASETEN_SAM3_MODEL_ID', '');
    const { runTool } = await loadTools();
    const out = await runTool(photoRun({ photoImage: 'data:image/jpeg;base64,AAA' }), {
      name: 'segment_photo',
      args: {},
    });
    expect(out.observation).toMatch(/baseten is not configured/);
    expect(out.observation).toMatch(/BASETEN_API_KEY/);
  });

  it('sets a photo plan without calling any provider', async () => {
    const { runTool } = await loadTools();
    const run = photoRun();
    const out = await runTool(run, { name: 'set_plan', args: {} });
    const body = JSON.parse(out.observation) as { ok: boolean; plan: { steps: string[] } };
    expect(body.ok).toBe(true);
    expect(body.plan.steps).toContain('segment_photo');
  });
});

describe('segment_photo success path (mocked providers)', () => {
  async function loadWithMocks() {
    vi.stubEnv('BASETEN_API_KEY', 'test');
    vi.stubEnv('BASETEN_SAM3_MODEL_ID', 'test-model');
    vi.stubEnv('META_API_KEY', 'test');
    vi.stubEnv('OPENIDEA_API_KEY', 'test');
    vi.stubGlobal(
      'fetch',
      (async (url: unknown, init?: { body?: string }) => {
        const u = String(url);
        if (u.includes('baseten')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              segments: [
                { index: 0, bbox: [0, 0, 100, 50], mask: 'data:image/png;base64,MASK0', score: 0.9 },
                { index: 1, bbox: [10, 10, 20, 20], mask: 'data:image/png;base64,MASK1', score: 0.8 },
              ],
            }),
          };
        }
        if (u.includes('openidea.world')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { id: 'hw:1', type: 'hardware', title: 'ESP32 devkit', url: 'https://openidea.world/r/1', description: 'devkit' },
              ],
            }),
          };
        }
        if (u.includes('api.meta.ai')) {
          const body = String(init?.body ?? '');
          // labelSegments sends the box list; enrichParts sends prose.
          const content = body.includes('Boxes:')
            ? JSON.stringify({ parts: [{ index: 0, name: 'ESP32 module', confidence: 0.9 }] })
            : '# Parts list\n\n- ESP32 module';
          return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }], usage: {} }) };
        }
        throw new Error(`unexpected fetch ${u}`);
      }) as unknown as typeof fetch,
    );
    return await import('@/lib/agent/tools/index');
  }

  it('segments, names, searches and writes the parts list', async () => {
    const { runTool } = await loadWithMocks();
    const run = photoRun({ photoImage: 'data:image/jpeg;base64,AAA' });
    const out = await runTool(run, { name: 'segment_photo', args: {} });
    const body = JSON.parse(out.observation) as { ok: boolean; parts: { name: string }[]; markdown: string };
    expect(body.ok).toBe(true);
    expect(body.parts.map((p) => p.name)).toContain('ESP32 module');
    expect(body.markdown).toMatch(/Parts list/);
    // Masks stay out of the run: only boxes persist.
    expect(run.photoSegments).toEqual([
      { index: 0, bbox: [0, 0, 100, 50], score: 0.9 },
      { index: 1, bbox: [10, 10, 20, 20], score: 0.8 },
    ]);
    expect(run.partsMarkdown).toMatch(/Parts list/);
    expect(run.resources.map((r) => r.url)).toContain('https://openidea.world/r/1');
  });

  it('reports a cold GPU as warming so the controller retries', async () => {
    vi.stubEnv('BASETEN_API_KEY', 'test');
    vi.stubEnv('BASETEN_SAM3_MODEL_ID', 'test-model');
    vi.stubGlobal(
      'fetch',
      (async () => ({ ok: false, status: 503, text: async () => 'warming' })) as unknown as typeof fetch,
    );
    const { runTool } = await import('@/lib/agent/tools/index');
    const out = await runTool(photoRun({ photoImage: 'data:image/jpeg;base64,AAA' }), {
      name: 'segment_photo',
      args: {},
    });
    expect(out.observation).toMatch(/warming/);
  });
});

describe('photo submit gate', () => {
  it('refuses submit before segment_photo and before citations', async () => {
    const { checkPrototype } = await import('@/lib/agent/verify/prototype');
    const noParts = checkPrototype(photoRun());
    expect(noParts.ok).toBe(false);
    if (!noParts.ok) expect(noParts.feedback).toMatch(/segment_photo/);
    const noCites = checkPrototype(photoRun({ partsMarkdown: '# Parts' }));
    expect(noCites.ok).toBe(false);
  });

  it('accepts a parts list with citations from retrieved resources', async () => {
    const { checkPrototype } = await import('@/lib/agent/verify/prototype');
    const run = photoRun({
      partsMarkdown: '# Parts',
      resources: [{ id: 'hw:1', type: 'hardware', title: 'ESP32 devkit', url: 'https://openidea.world/r/1' }],
      citations: [{ title: 'ESP32 devkit', url: 'https://openidea.world/r/1' }],
    });
    expect(checkPrototype(run)).toEqual({ ok: true });
  });
});

describe('photo run plumbing', () => {
  it('createRun holds the uploaded photo off the controller history', async () => {
    const { createRun } = await import('@/lib/agent/loop');
    const run = createRun({ kind: 'photo', input: 'psu', planTier: 'free', image: 'data:image/jpeg;base64,AAA' });
    expect(run.photoImage).toBe('data:image/jpeg;base64,AAA');
  });

  it('labelSegments names the missing key without calling the network', async () => {
    vi.stubEnv('META_API_KEY', '');
    const { labelSegments } = await import('@/lib/muse');
    const r = await labelSegments('data:image/jpeg;base64,AAA', [{ index: 0, bbox: [0, 0, 10, 10], score: 0.5 }]);
    expect(r).toMatchObject({ ok: false, missing: 'META_API_KEY' });
  });
});
