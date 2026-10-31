import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'AutoEvolve Protocol',
  description:
    'ZK-attested self-improving agent: prove Score(Vn+1) > Score(Vn) under a frozen rubric, publish sanitized memory to IPFS and settle a testnet reward.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-edge/70 bg-ink/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/40 bg-accent/10 text-sm font-bold text-accent">
                AE
              </span>
              <span className="text-sm font-semibold tracking-wide">
                AutoEvolve <span className="text-slate-500">Protocol</span>
              </span>
            </Link>
            <nav className="flex items-center gap-6 text-sm text-slate-400">
              <Link href="/" className="hover:text-white">
                Runs
              </Link>
              <Link href="/registry" className="hover:text-white">
                Registry
              </Link>
              <a
                href={process.env.NEXT_PUBLIC_BASESCAN_URL || 'https://sepolia.basescan.org'}
                target="_blank"
                rel="noreferrer"
                className="hover:text-white"
              >
                Explorer ↗
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-7xl px-6 pb-10 pt-4 text-xs text-slate-500">
          Proof claim: score arithmetic validity &amp; strict increase — not proof of LLM inference.
        </footer>
      </body>
    </html>
  );
}
