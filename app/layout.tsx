import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenIdea Lab',
  description: 'Turn an idea, a research paper or a photo of hardware into a working prototype.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_LAB_URL || 'http://localhost:3000'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-[var(--line)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              OpenIdea <span className="text-[var(--accent)]">Lab</span>
            </Link>
            <nav className="flex gap-4 text-sm text-[var(--muted)]">
              <Link href="/agent" className="hover:text-[var(--fg)]">Agent</Link>
              <Link href="/demo/paid?step=paid" className="hover:text-[var(--fg)]">Paid demo</Link>
              <Link href="/idea" className="hover:text-[var(--fg)]">Idea</Link>
              <Link href="/paper" className="hover:text-[var(--fg)]">Paper</Link>
              <Link href="/photo" className="hover:text-[var(--fg)]">Photo</Link>
              <Link href="/history" className="hover:text-[var(--fg)]">History</Link>
              <a href="https://openidea.world" className="hover:text-[var(--fg)]">openidea.world ↗</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-8 text-xs text-[var(--muted)]">
          Muse-only Lab Agent (Meta Muse Spark). SAM 3 on Baseten is optional vision GPU. Lab Pro ≤ $20. Built during the Meta Global AI Developer Hackathon 2026.
          {' '}<a className="underline" href="https://github.com/Sony17/openidea-lab">Source</a>
        </footer>
      </body>
    </html>
  );
}
