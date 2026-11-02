import { afterEach, describe, expect, it } from 'vitest';
import {
  MUSE_IDS,
  MUSE_MODEL_DEFAULTS,
  modelFor,
  museTaskModelMap,
  routeMuseModel,
} from '@/lib/muse-models';

const saved = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('META_MODEL')) delete process.env[k];
  }
});

describe('Muse quality/credit router', () => {
  it('routes primary builders to Wonder or Spark Standard', () => {
    expect(routeMuseModel('choose').model).toBe(MUSE_IDS.wonder);
    expect(routeMuseModel('plan').tier).toBe('wonder');
    expect(routeMuseModel('draft').model).toBe(MUSE_IDS.spark);
    expect(routeMuseModel('verdict').model).toBe(MUSE_IDS.wonder);
    expect(routeMuseModel('fix', { attempt: 0 }).model).toBe(MUSE_IDS.spark);
    expect(routeMuseModel('fix', { attempt: 1 }).tier).toBe('spark');
  });

  it('routes light steps and cheap retries to Contributor', () => {
    expect(routeMuseModel('rank').model).toBe(MUSE_IDS.sparkLightContributor);
    expect(routeMuseModel('rank').tier).toBe('contributor');
    expect(routeMuseModel('observe').tier).toBe('contributor');
    expect(routeMuseModel('enrich').model).toBe(MUSE_IDS.sparkContributor);
    expect(routeMuseModel('fix', { attempt: 2 }).model).toBe(MUSE_IDS.sparkContributor);
    expect(routeMuseModel('fix', { attempt: 2 }).tier).toBe('contributor');
  });

  it('keeps SAM for segmentation', () => {
    expect(modelFor('segment')).toBe(MUSE_IDS.sam);
  });

  it('does not let META_MODEL alone collapse every task', () => {
    process.env.META_MODEL = 'muse-spark-1.1';
    expect(modelFor('choose')).toBe(MUSE_IDS.wonder);
    expect(modelFor('rank')).toBe(MUSE_IDS.sparkLightContributor);
  });

  it('honours role overrides and force-all escape hatch', () => {
    process.env.META_MODEL_CHOOSE = 'muse-spark-1.3';
    expect(modelFor('choose')).toBe('muse-spark-1.3');
    process.env.META_MODEL_FORCE_ALL = '1';
    process.env.META_MODEL = 'muse-spark-1.1';
    expect(modelFor('plan')).toBe('muse-spark-1.1');
    expect(modelFor('segment')).toBe(MUSE_IDS.sam);
  });

  it('exposes a full task map with Contributor on rank', () => {
    const map = museTaskModelMap();
    expect(map.verdict).toBe(MUSE_IDS.wonder);
    expect(map.draft).toBe(MUSE_IDS.spark);
    expect(map.rank).toBe(MUSE_IDS.sparkLightContributor);
    expect(MUSE_MODEL_DEFAULTS.fix).toBe(MUSE_IDS.spark);
  });

  it('quality=primary forces Spark on fix even for high attempt', () => {
    expect(routeMuseModel('fix', { attempt: 5, quality: 'primary' }).model).toBe(MUSE_IDS.spark);
  });
});
