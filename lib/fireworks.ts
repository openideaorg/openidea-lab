/**
 * Fireworks: retired from the Lab Pro hot path (Muse-only, ≤$20 credit).
 *
 * Lab Pro routes rank/fix/label/verdict through lib/muse.ts on the
 * contributor/wonder tiers instead: one provider, one bill, no second API key.
 * This file stays so old imports keep working and the partner remains visible;
 * every function delegates to its Muse equivalent. New code imports from
 * lib/muse.ts directly.
 */

export { rank, fix, labelParts, verdict } from './muse';
export type { LabelledPart, Verdict, FixAttempt } from './muse';
