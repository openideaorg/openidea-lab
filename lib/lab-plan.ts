/**
 * Lab product packaging: Free teaser vs a single paid SKU at ≤ $20.
 *
 * Moonstar constraint: the paid Lab product must be priced at most $20 —
 * not the platform's ₹999 Plus framing as Lab's own SKU. Lab Pro is that
 * paid SKU. Platform Plus ($12) already sits under the cap and can fund the
 * same wallet later; Lab meters against LAB_PLANS here regardless.
 *
 * Override price with LAB_PRO_PRICE_USD (must stay ≤ LAB_PRO_MAX_PRICE_USD).
 */

export const LAB_PRO_MAX_PRICE_USD = 20;

export type LabPlanTier = 'free' | 'pro';

export interface LabPlan {
  tier: LabPlanTier;
  label: string;
  /** List price in USD. Free is 0; Pro is capped at LAB_PRO_MAX_PRICE_USD. */
  priceUsd: number;
  /** Metered Lab agent runs per calendar month. */
  labRunsPerMonth: number;
  durableReplay: boolean;
  citationsExport: boolean;
  hitlSignOff: boolean;
  studioFilesHandoff: boolean;
  /** Photo / SAM is optional GPU infra — Pro only, still secondary to Muse. */
  photoSam: boolean;
}

function proPriceUsd(): number {
  const raw = process.env.LAB_PRO_PRICE_USD;
  const n = raw ? Number(raw) : 20;
  if (!Number.isFinite(n) || n < 0) return LAB_PRO_MAX_PRICE_USD;
  return Math.min(n, LAB_PRO_MAX_PRICE_USD);
}

export const LAB_PLANS: Record<LabPlanTier, LabPlan> = {
  free: {
    tier: 'free',
    label: 'Free',
    priceUsd: 0,
    labRunsPerMonth: 2,
    durableReplay: false,
    citationsExport: false,
    hitlSignOff: false,
    studioFilesHandoff: false,
    photoSam: false,
  },
  pro: {
    tier: 'pro',
    label: 'Lab Pro',
    priceUsd: proPriceUsd(),
    labRunsPerMonth: 25,
    durableReplay: true,
    citationsExport: true,
    hitlSignOff: true,
    studioFilesHandoff: true,
    photoSam: true,
  },
};

/** Resolve the effective Lab plan. Default free; set LAB_PLAN=pro for paid. */
export function getLabPlan(tier?: string | null): LabPlan {
  const t = (tier || process.env.LAB_PLAN || 'free').toLowerCase();
  return t === 'pro' ? LAB_PLANS.pro : LAB_PLANS.free;
}

export function assertLabProUnderCap(plan: LabPlan = LAB_PLANS.pro): void {
  if (plan.tier === 'pro' && plan.priceUsd > LAB_PRO_MAX_PRICE_USD) {
    throw new Error(`Lab Pro price $${plan.priceUsd} exceeds hard cap $${LAB_PRO_MAX_PRICE_USD}`);
  }
}

/** Features the free teaser must not unlock (upgrade CTA). */
export function freeFenceMessage(feature: keyof Omit<LabPlan, 'tier' | 'label' | 'priceUsd' | 'labRunsPerMonth'>): string {
  return `“${feature}” needs Lab Pro (≤ $${LAB_PRO_MAX_PRICE_USD}/mo). Free is a teaser only.`;
}
