'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, formatWei, shorten } from '@/lib/api';
import type { RegistryResponse } from '@/lib/types';
import { Badge } from '@/components/Badge';
import { CopyButton } from '@/components/CopyButton';

export default function RegistryPage() {
  const [registry, setRegistry] = useState<RegistryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .registry()
      .then(setRegistry)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div className="space-y-5">
      <section className="panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white">Improvement registry</h1>
            <p className="mt-1 text-sm text-slate-400">
              Append-only memory: verified score transitions and the CID of each sanitized manifest.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={registry?.chainConfigured ? 'good' : 'neutral'}>
              {registry?.chainConfigured ? `Base Sepolia · ${registry.chainId}` : 'chain not configured'}
            </Badge>
            <Badge tone="accent">{registry?.local.length ?? 0} local publication(s)</Badge>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
          worker unreachable: {error}
        </div>
      ) : null}

      <section className="panel p-5">
        <h2 className="panel-title mb-3">On-chain events · ImprovementVerified</h2>
        {registry?.onChain.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="pb-2 pr-4">Transition</th>
                  <th className="pb-2 pr-4">Scores</th>
                  <th className="pb-2 pr-4">Agent</th>
                  <th className="pb-2 pr-4">Reward</th>
                  <th className="pb-2 pr-4">CID</th>
                  <th className="pb-2">Tx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/70">
                {registry.onChain.map((event) => (
                  <tr key={`${event.txHash}-${event.transitionId}`}>
                    <td className="py-2 pr-4 mono text-slate-300">{shorten(event.transitionId, 12, 4)}</td>
                    <td className="py-2 pr-4 mono text-accent">
                      {event.oldScore} → {event.newScore}
                    </td>
                    <td className="py-2 pr-4 mono text-slate-400">{shorten(event.agent, 8, 4)}</td>
                    <td className="py-2 pr-4 mono text-slate-300">{formatWei(event.rewardWei)}</td>
                    <td className="py-2 pr-4 mono text-slate-500">{shorten(event.cid, 10, 6)}</td>
                    <td className="py-2">
                      <a
                        href={`${registry.chainId === 84532 ? 'https://sepolia.basescan.org' : ''}/tx/${event.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mono text-accent hover:underline"
                      >
                        {shorten(event.txHash, 8, 6)} ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No on-chain events yet. Deploy the registry and set worker chain credentials to settle
            proofs on Base Sepolia; local publications are listed below.
          </p>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="panel-title mb-3">Published memory manifests</h2>
        {registry?.local.length ? (
          <div className="space-y-2">
            {registry.local.map((entry) => (
              <div
                key={entry.cid}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge/70 p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/runs/${entry.runId}`} className="mono text-xs text-accent hover:underline">
                      {entry.runId}
                    </Link>
                    <Badge tone="neutral">{entry.provider}</Badge>
                    <Badge tone="neutral">{entry.proofs} proof(s)</Badge>
                  </div>
                  <div className="mono mt-1 break-all text-[11px] text-slate-500">{entry.cid}</div>
                  <div className="mono mt-1 text-[10px] text-slate-600">
                    scores {entry.scores.map((s) => `${s.version}:${s.total ?? '–'}`).join(' · ')}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CopyButton value={entry.cid} />
                  <a
                    href={entry.gatewayUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-edge px-2 py-0.5 text-[11px] text-slate-400 hover:border-accent/50 hover:text-accent"
                  >
                    fetch ↗
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Nothing published yet — run an evolution first.</p>
        )}
      </section>
    </div>
  );
}
