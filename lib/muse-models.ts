/**
 * Muse model router — best Meta Model API id per step (quality vs credit).
 *
 * Catalog (https://dev.meta.ai/docs/models):
 *   muse-wonder-1.0              — most capable; long-horizon agentic / hard judgment
 *   muse-spark-1.3               — latest Spark; coding-tuned primary builder
 *   muse-spark-1.3-contributor   — same Spark, Contributor mode (cheaper credit)
 *   muse-spark-1.2-contributor   — lighter Spark Contributor for classify/rank
 *   sam-3.1                      — Segment Anything (geometry; not LLM)
 *
 * Policy (Moonstar):
 *   Primary builders = Spark + Wonder for plan / draft / hard fix / verdict / choose.
 *   Contributor = cheaper credit for rank, classify, simple observe, cheap retries.
 *
 * Override any role with META_MODEL_<ROLE>. Escape hatch: META_MODEL_FORCE_ALL=1 + META_MODEL.
 */

export type MuseTask =
  | 'choose'
  | 'plan'
  | 'draft'
  | 'fix'
  | 'rank'
  | 'verdict'
  | 'enrich'
  | 'vision'
  | 'observe'
  | 'segment';

export type MuseTier = 'wonder' | 'spark' | 'contributor' | 'sam';

export type RouteHint = {
  /** Force primary builders even on a normally-economy task. */
  quality?: 'primary' | 'economy';
  /** 0-based attempt (e.g. fixCount). Higher → prefer Contributor for retries. */
  attempt?: number;
};

export interface MuseRoute {
  task: MuseTask;
  model: string;
  tier: MuseTier;
  why: string;
}

/** Named Muse ids used by the router (Standard + Contributor). */
export const MUSE_IDS = {
  wonder: 'muse-wonder-1.0',
  spark: 'muse-spark-1.3',
  sparkContributor: 'muse-spark-1.3-contributor',
  sparkLightContributor: 'muse-spark-1.2-contributor',
  sam: 'sam-3.1',
} as const;

/**
 * Static routing table (defaults before env overrides / attempt hints).
 * Primary = Wonder or Spark Standard; economy = Contributor.
 */
export const MUSE_ROUTING_TABLE: Record<
  MuseTask,
  { primary: string; economy: string; tierPrimary: MuseTier; tierEconomy: MuseTier; why: string }
> = {
  choose: {
    primary: MUSE_IDS.wonder,
    economy: MUSE_IDS.wonder,
    tierPrimary: 'wonder',
    tierEconomy: 'wonder',
    why: 'Long-horizon tool-loop controller — Wonder primary builder',
  },
  plan: {
    primary: MUSE_IDS.wonder,
    economy: MUSE_IDS.wonder,
    tierPrimary: 'wonder',
    tierEconomy: 'wonder',
    why: 'Buildability / claim plan — Wonder primary builder',
  },
  draft: {
    primary: MUSE_IDS.spark,
    economy: MUSE_IDS.spark,
    tierPrimary: 'spark',
    tierEconomy: 'spark',
    why: 'First-draft code/notebook — Spark 1.3 primary builder',
  },
  fix: {
    primary: MUSE_IDS.spark,
    economy: MUSE_IDS.sparkContributor,
    tierPrimary: 'spark',
    tierEconomy: 'contributor',
    why: 'Hard fixes → Spark; cheap retries → Spark Contributor',
  },
  verdict: {
    primary: MUSE_IDS.wonder,
    economy: MUSE_IDS.wonder,
    tierPrimary: 'wonder',
    tierEconomy: 'wonder',
    why: 'Paper claims judgment — Wonder primary builder',
  },
  rank: {
    primary: MUSE_IDS.sparkLightContributor,
    economy: MUSE_IDS.sparkLightContributor,
    tierPrimary: 'contributor',
    tierEconomy: 'contributor',
    why: 'Search ranking / classify — Spark 1.2 Contributor (cheaper credit)',
  },
  enrich: {
    primary: MUSE_IDS.sparkContributor,
    economy: MUSE_IDS.sparkContributor,
    tierPrimary: 'contributor',
    tierEconomy: 'contributor',
    why: 'Parts-list prose — Spark Contributor (light write)',
  },
  vision: {
    primary: MUSE_IDS.sparkContributor,
    economy: MUSE_IDS.sparkContributor,
    tierPrimary: 'contributor',
    tierEconomy: 'contributor',
    why: 'Label crops / simple vision — Spark Contributor multimodal',
  },
  observe: {
    primary: MUSE_IDS.sparkLightContributor,
    economy: MUSE_IDS.sparkLightContributor,
    tierPrimary: 'contributor',
    tierEconomy: 'contributor',
    why: 'Simple observe / summarize — Spark 1.2 Contributor',
  },
  segment: {
    primary: MUSE_IDS.sam,
    economy: MUSE_IDS.sam,
    tierPrimary: 'sam',
    tierEconomy: 'sam',
    why: 'Segmentation geometry — sam-3.1 (not LLM)',
  },
};

/** @deprecated Prefer MUSE_ROUTING_TABLE + routeMuseModel — kept for tests/docs. */
export const MUSE_MODEL_DEFAULTS: Record<MuseTask, string> = {
  choose: MUSE_ROUTING_TABLE.choose.primary,
  plan: MUSE_ROUTING_TABLE.plan.primary,
  draft: MUSE_ROUTING_TABLE.draft.primary,
  fix: MUSE_ROUTING_TABLE.fix.primary,
  rank: MUSE_ROUTING_TABLE.rank.economy,
  verdict: MUSE_ROUTING_TABLE.verdict.primary,
  enrich: MUSE_ROUTING_TABLE.enrich.economy,
  vision: MUSE_ROUTING_TABLE.vision.economy,
  observe: MUSE_ROUTING_TABLE.observe.economy,
  segment: MUSE_ROUTING_TABLE.segment.primary,
};

const ENV_FOR_TASK: Record<MuseTask, string> = {
  choose: 'META_MODEL_CHOOSE',
  plan: 'META_MODEL_PLAN',
  draft: 'META_MODEL_DRAFT',
  fix: 'META_MODEL_FIX',
  rank: 'META_MODEL_RANK',
  verdict: 'META_MODEL_VERDICT',
  enrich: 'META_MODEL_ENRICH',
  vision: 'META_MODEL_VISION',
  observe: 'META_MODEL_OBSERVE',
  segment: 'META_MODEL_SEGMENT',
};

function preferEconomy(task: MuseTask, hint?: RouteHint): boolean {
  if (hint?.quality === 'primary') return false;
  if (hint?.quality === 'economy') return true;
  // Cheap retries on fix after the first hard attempt.
  if (task === 'fix' && (hint?.attempt ?? 0) >= 2) return true;
  // Light tasks default to Contributor.
  return task === 'rank' || task === 'enrich' || task === 'vision' || task === 'observe';
}

/**
 * Router: pick Muse model for this step (quality vs credit).
 * Env role override wins; FORCE_ALL collapses chat models; segment stays SAM.
 */
export function routeMuseModel(task: MuseTask, hint?: RouteHint): MuseRoute {
  const row = MUSE_ROUTING_TABLE[task];
  const role = process.env[ENV_FOR_TASK[task]]?.trim();
  if (role) {
    const tier: MuseTier = role.includes('contributor')
      ? 'contributor'
      : role.startsWith('muse-wonder')
        ? 'wonder'
        : role.startsWith('sam')
          ? 'sam'
          : role.includes('spark')
            ? 'spark'
            : row.tierPrimary;
    return { task, model: role, tier, why: `${row.why} (env ${ENV_FOR_TASK[task]})` };
  }

  const forceAll = process.env.META_MODEL_FORCE_ALL === '1' || process.env.META_MODEL_FORCE_ALL === 'true';
  const global = process.env.META_MODEL?.trim();
  if (forceAll && global && task !== 'segment') {
    return { task, model: global, tier: 'spark', why: 'META_MODEL_FORCE_ALL override' };
  }

  const economy = preferEconomy(task, hint);
  return {
    task,
    model: economy ? row.economy : row.primary,
    tier: economy ? row.tierEconomy : row.tierPrimary,
    why: economy && row.primary !== row.economy ? `${row.why} [economy]` : row.why,
  };
}

/** Resolve model id for a task (+ optional attempt/quality hint). */
export function modelFor(task: MuseTask, hint?: RouteHint): string {
  return routeMuseModel(task, hint).model;
}

/** Resolved routing table for API / docs / console. */
export function museTaskModelMap(hint?: RouteHint): Record<MuseTask, string> {
  return {
    choose: modelFor('choose', hint),
    plan: modelFor('plan', hint),
    draft: modelFor('draft', hint),
    fix: modelFor('fix', hint),
    rank: modelFor('rank', hint),
    verdict: modelFor('verdict', hint),
    enrich: modelFor('enrich', hint),
    vision: modelFor('vision', hint),
    observe: modelFor('observe', hint),
    segment: modelFor('segment', hint),
  };
}

/** Full routes with why/tier — for agent API + PR docs. */
export function museRoutingTable(hint?: RouteHint): MuseRoute[] {
  return (Object.keys(MUSE_ROUTING_TABLE) as MuseTask[]).map((task) => routeMuseModel(task, hint));
}
