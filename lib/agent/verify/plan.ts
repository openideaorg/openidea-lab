import type { Plan } from '../../muse';

export type PlanCheck = { ok: true } | { ok: false; feedback: string };

/** Structural plan check — handbook Session-2 pattern, inside set_plan. */
export function checkPlan(plan: Plan): PlanCheck {
  if (!plan.summary?.trim()) return { ok: false, feedback: 'Plan summary is empty.' };
  if (!Array.isArray(plan.exists) || plan.exists.length === 0) {
    return { ok: false, feedback: 'Plan must list what already exists (non-empty exists[]).' };
  }
  if (!Array.isArray(plan.missing)) {
    return { ok: false, feedback: 'Plan must include a missing[] array (may note "nothing critical").' };
  }
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    return { ok: false, feedback: 'Plan must include concrete steps[].' };
  }
  if (plan.buildable && plan.missing.length === 0 && plan.steps.length < 2) {
    return { ok: false, feedback: 'Buildable plans need at least two concrete steps.' };
  }
  return { ok: true };
}
