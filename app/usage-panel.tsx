'use client';

/**
 * What the last run spent, per provider. Meta reports tokens (the label names
 * the tier: plan, draft, notebook, parts, rank, fix, label, verdict);
 * Baseten reports GPU seconds because SAM 3 is billed by time on the endpoint.
 * The Fireworks row is legacy — Lab Pro routes are Muse-only.
 * Cost columns appear only when prices are set in .env.local.
 */

import { LAB_PLANS, LAB_PRO_MAX_PRICE_USD } from '@/lib/lab-plan';
import { runsPerBudget, summarise, type UsageEntry } from '@/lib/usage-types';

const fmt = (n: number) => n.toLocaleString('en-US');
const usd = (n?: number) => (n === undefined ? '—' : n < 0.01 ? `<$0.01` : `$${n.toFixed(2)}`);

export function UsagePanel({ entries }: { entries: UsageEntry[] }) {
  if (!entries.length) return null;
  const s = summarise(entries);
  const priced = s.costUsd !== undefined;

  return (
    <div>
      <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">Usage this run</h2>
      <div className="mt-2 overflow-x-auto rounded-md border border-[var(--line)] bg-[var(--surface)]">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 font-normal">Provider</th>
              <th className="px-3 py-2 text-right font-normal">Calls</th>
              <th className="px-3 py-2 text-right font-normal">Input</th>
              <th className="px-3 py-2 text-right font-normal">Output</th>
              <th className="px-3 py-2 text-right font-normal">Cost</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {s.meta && (
              <tr className="border-t border-[var(--line)]">
                <td className="px-3 py-2">Meta · Muse</td>
                <td className="px-3 py-2 text-right">{s.meta.calls}</td>
                <td className="px-3 py-2 text-right">{fmt(s.meta.promptTokens)}</td>
                <td className="px-3 py-2 text-right">{fmt(s.meta.completionTokens)}</td>
                <td className="px-3 py-2 text-right">{usd(s.meta.costUsd)}</td>
              </tr>
            )}
            {s.fireworks && (
              <tr className="border-t border-[var(--line)]">
                <td className="px-3 py-2">Fireworks</td>
                <td className="px-3 py-2 text-right">{s.fireworks.calls}</td>
                <td className="px-3 py-2 text-right">{fmt(s.fireworks.promptTokens)}</td>
                <td className="px-3 py-2 text-right">{fmt(s.fireworks.completionTokens)}</td>
                <td className="px-3 py-2 text-right">{usd(s.fireworks.costUsd)}</td>
              </tr>
            )}
            {s.basetenLlm && (
              <tr className="border-t border-[var(--line)]">
                <td className="px-3 py-2">Baseten · Spark Open (fallback)</td>
                <td className="px-3 py-2 text-right">{s.basetenLlm.calls}</td>
                <td className="px-3 py-2 text-right">{fmt(s.basetenLlm.promptTokens)}</td>
                <td className="px-3 py-2 text-right">{fmt(s.basetenLlm.completionTokens)}</td>
                <td className="px-3 py-2 text-right">{usd(s.basetenLlm.costUsd)}</td>
              </tr>
            )}
            {s.baseten && (
              <tr className="border-t border-[var(--line)]">
                <td className="px-3 py-2">Baseten · SAM 3</td>
                <td className="px-3 py-2 text-right">{s.baseten.calls}</td>
                <td className="px-3 py-2 text-right text-[var(--muted)]" colSpan={2}>
                  {s.baseten.seconds.toFixed(1)} s on GPU
                  {s.baseten.warmups > 0 ? ` · ${s.baseten.warmups} warm-up${s.baseten.warmups > 1 ? 's' : ''}` : ''}
                </td>
                <td className="px-3 py-2 text-right">{usd(s.baseten.costUsd)}</td>
              </tr>
            )}
          </tbody>
          {priced && (
            <tfoot>
              <tr className="border-t border-[var(--line)] font-medium">
                <td className="px-3 py-2" colSpan={4}>Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{usd(s.costUsd)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!priced && (
        <p className="mt-1 text-xs text-[var(--muted)]">
          Set the *_PRICE_* variables in .env.local to see cost. Baseten time includes cold starts, so it can be higher than
          the compute you are billed for. Lab Pro (≤ ${LAB_PRO_MAX_PRICE_USD}/mo) covers {LAB_PLANS.pro.labRunsPerMonth} metered
          runs a month.
        </p>
      )}
      {priced && <ProMath total={s.costUsd} />}
    </div>
  );
}

/**
 * Why the ≤$20 price is credible: this run cost $X, so the Pro credit covers
 * ≈N runs like it — measured, not asserted. Falls back to the plan quota when
 * the run was free (all-zero cost rounds to <$0.01 but divides fine).
 */
function ProMath({ total }: { total?: number }) {
  const runs = runsPerBudget(total, LAB_PRO_MAX_PRICE_USD);
  return (
    <p className="mt-1 text-xs text-[var(--muted)]">
      {runs !== undefined
        ? `This run: ${usd(total)}. Lab Pro (≤ $${LAB_PRO_MAX_PRICE_USD}/mo) covers ≈${runs.toLocaleString('en-US')} runs like this.`
        : `Lab Pro (≤ $${LAB_PRO_MAX_PRICE_USD}/mo) covers ${LAB_PLANS.pro.labRunsPerMonth} metered runs a month.`}
    </p>
  );
}
