import Link from 'next/link';
import { configured } from '@/lib/env';

const FLOWS = [
  {
    href: '/agent',
    icon: '✦',
    title: 'Lab Agent (Muse)',
    out: 'Handbook-style tool loop: Muse chooses tools, console shows plan/act/observe, HITL sign-off. Lab Pro ≤ $20.',
    needs: ['openidea', 'meta'] as const,
    primary: true,
  },
  {
    href: '/idea',
    icon: '💡',
    title: 'An idea (legacy)',
    out: 'One-shot pipeline demo. Prefer Lab Agent for the paid product path.',
    needs: ['openidea', 'meta'] as const,
  },
  {
    href: '/paper',
    icon: '📄',
    title: 'A research paper (legacy)',
    out: 'One-shot paper notebook demo. Prefer Lab Agent.',
    needs: ['openidea', 'meta'] as const,
  },
  {
    href: '/photo',
    icon: '📷',
    title: 'A photo of hardware',
    out: 'Optional SAM 3 vision (Baseten GPU). Secondary to Muse reasoning.',
    needs: ['baseten', 'meta', 'openidea'] as const,
  },
];

export default function Home() {
  const ok = configured();
  return (
    <div className="grid gap-8">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">From open knowledge to a running prototype.</h1>
        <p className="mt-3 text-[var(--muted)]">
          Open Idea Lab is a Muse-only research→prototype agent. Muse Spark plans, drafts, fixes, and judges; the
          browser sandbox runs the result. Free is a teaser; <strong className="text-[var(--fg)]">Lab Pro ≤ $20</strong> unlocks
          durable runs, citations export, and HITL. Set <code className="text-[var(--fg)]">META_API_KEY</code> from Cursor /
          Claude Code Muse keys.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        {FLOWS.map((f) => {
          const missing = f.needs.filter((p) => !ok[p]);
          return (
            <Link
              key={f.href}
              href={f.href}
              className={`rounded-lg border bg-[var(--surface)] p-5 transition hover:border-[var(--accent)] ${
                'primary' in f && f.primary ? 'border-[var(--accent)]' : 'border-[var(--line)]'
              }`}
            >
              <div className="text-2xl">{f.icon}</div>
              <h2 className="mt-2 font-medium">{f.title}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{f.out}</p>
              {missing.length > 0 && (
                <p className="mt-3 text-xs text-amber-300">Needs: {missing.join(', ')}</p>
              )}
            </Link>
          );
        })}
      </section>
    </div>
  );
}
