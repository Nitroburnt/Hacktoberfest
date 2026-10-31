'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, WORKER_ORIGIN, shorten } from '@/lib/api';
import type { RunRecord, WsConfig } from '@/lib/types';
import { Badge, StatusBadge } from '@/components/Badge';

export default function HomePage() {
  const router = useRouter();
  const [config, setConfig] = useState<WsConfig | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [offline, setOffline] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [cfg, list] = await Promise.all([api.config(), api.runs()]);
      setConfig(cfg);
      setRuns(list.runs);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  };

  useEffect(() => {
    void load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, []);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const run = await api.startRun();
      router.push(`/runs/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="panel overflow-hidden p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">ZK-attested self-improvement</Badge>
              <Badge tone={offline ? 'bad' : 'good'}>
                worker {offline ? 'offline' : 'online'}
              </Badge>
              {config ? (
                <>
                  <Badge tone={config.mockLlm ? 'warn' : 'good'}>
                    {config.mockLlm ? `mock LLM${config.mockReason ? ` · ${config.mockReason}` : ''}` : 'live Featherless'}
                  </Badge>
                  <Badge tone={config.chainConfigured ? 'good' : 'neutral'}>
                    {config.chainConfigured ? 'Base Sepolia connected' : 'chain not configured'}
                  </Badge>
                </>
              ) : null}
            </div>
            <h1 className="mt-4 text-3xl font-semibold leading-tight text-white">
              Prove the agent got better — without revealing how.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              AutoEvolve runs a generate → critique → revise loop, scores every version against a
              frozen benchmark, proves <span className="mono text-slate-200">Score(Vn+1) &gt; Score(Vn)</span>{' '}
              in Groth16, publishes a sanitized memory manifest to IPFS and settles a testnet reward
              on Base Sepolia.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Claim: proof of score arithmetic validity &amp; strict increase under a fixed rubric.
              We do <span className="font-semibold">not</span> claim proof of LLM inference.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={start}
                disabled={starting || offline}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {starting ? 'starting…' : 'Start new run'}
              </button>
              <Link
                href="/registry"
                className="rounded-lg border border-edge px-4 py-2 text-sm text-slate-300 hover:border-accent/50 hover:text-accent"
              >
                On-chain registry
              </Link>
              {offline ? (
                <span className="text-xs text-slate-500">
                  start the worker: <code className="mono">pnpm worker</code>
                </span>
              ) : null}
            </div>
            {error ? <p className="mt-3 text-xs text-bad">{error}</p> : null}
          </div>

          <div className="grid w-full max-w-sm gap-2 text-xs sm:grid-cols-2">
            {[
              ['01', 'Generate V1', 'pinned generator, temp 0'],
              ['02', 'Evaluate', 'Docker sandbox, 10+5 tests'],
              ['03', 'Critique', 'separate model, JSON schema'],
              ['04', 'Prove & settle', 'Groth16 → IPFS → Base'],
            ].map(([step, title, detail]) => (
              <div key={step} className="rounded-lg border border-edge/70 p-3">
                <div className="mono text-[10px] text-accent">{step}</div>
                <div className="mt-1 text-sm text-slate-200">{title}</div>
                <div className="mt-1 text-[11px] text-slate-500">{detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="panel-title">Runs</h2>
          <span className="text-[11px] text-slate-500">{runs.length} in local database</span>
        </div>

        {runs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="pb-2 pr-4">Run</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Scores</th>
                  <th className="pb-2 pr-4">Proofs</th>
                  <th className="pb-2 pr-4">CID</th>
                  <th className="pb-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/70">
                {runs.map((run) => (
                  <tr key={run.id} className="group">
                    <td className="py-2 pr-4">
                      <Link href={`/runs/${run.id}`} className="mono text-accent hover:underline">
                        {run.id}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="py-2 pr-4 mono text-slate-300">
                      {run.versions.map((v) => v.score?.total ?? '–').join(' → ') || '—'}
                    </td>
                    <td className="py-2 pr-4 mono text-slate-300">{run.proofs.length}</td>
                    <td className="py-2 pr-4 mono text-slate-500">
                      {run.publication ? shorten(run.publication.cid) : '—'}
                    </td>
                    <td className="py-2 text-[11px] text-slate-500">
                      {new Date(run.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No runs yet{runs.length === 0 && !offline ? ' — start one above.' : '.'}
          </p>
        )}
      </section>

      <section className="grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
        <div className="panel p-4">
          <div className="panel-title">Frozen rubric</div>
          <p className="mt-2 leading-relaxed">
            total = functional×8 + edge×3 + static (max 100). Safety gate: banned imports, 5s
            timeout, no network.
          </p>
        </div>
        <div className="panel p-4">
          <div className="panel-title">Private witness</div>
          <p className="mt-2 leading-relaxed">
            Metric counts and prompts stay in SQLite. Only score arithmetic and commitments become
            public signals.
          </p>
        </div>
        <div className="panel p-4">
          <div className="panel-title">Collective memory</div>
          <p className="mt-2 leading-relaxed">
            A second agent fetches published manifests, embeds them locally and cites the lessons
            it reuses.
          </p>
        </div>
      </section>

      <p className="text-center text-[11px] text-slate-600">worker {WORKER_ORIGIN}</p>
    </div>
  );
}
