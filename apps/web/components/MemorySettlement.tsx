'use client';

import { useState } from 'react';
import type { RunRecord } from '@/lib/types';
import { api, formatWei, gatewayUrl, shorten, WORKER_ORIGIN } from '@/lib/api';
import { Badge } from './Badge';
import { CopyButton } from './CopyButton';

export function MemorySettlement({ run }: { run: RunRecord }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const publication = run.publication;

  const fetchCid = async () => {
    if (!publication) return;
    setFetching(true);
    setFetchError(null);
    try {
      const manifest = await api.ipfs(publication.cid);
      setPreview(JSON.stringify(manifest, null, 2));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetching(false);
    }
  };

  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="panel-title">Memory &amp; settlement</h2>
        {publication ? (
          <Badge tone="accent">{publication.provider === 'local' ? 'local content store' : publication.provider}</Badge>
        ) : (
          <Badge tone="warn">not published</Badge>
        )}
      </div>

      {publication ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">CID</span>
            <code className="mono break-all text-accent">{publication.cid}</code>
            <CopyButton value={publication.cid} />
            <a
              href={gatewayUrl(publication.cid)}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-edge px-2 py-0.5 text-[11px] text-slate-400 hover:border-accent/50 hover:text-accent"
            >
              open ↗
            </a>
            <button
              type="button"
              onClick={fetchCid}
              className="rounded border border-edge px-2 py-0.5 text-[11px] text-slate-400 hover:border-accent/50 hover:text-accent"
            >
              {fetching ? 'fetching…' : 'fetch & validate'}
            </button>
          </div>
          <div className="mono text-[11px] text-slate-500">
            manifestCommitment {publication.manifestCommitment}
          </div>
          {fetchError ? <p className="text-xs text-bad">{fetchError}</p> : null}
          {preview ? (
            <pre className="mono max-h-56 overflow-auto rounded-lg border border-edge/70 bg-black/30 p-3 text-slate-400">
              {preview}
            </pre>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          The sanitized manifest appears here after proving, with a fetch-back validation log.
        </p>
      )}

      <div className="mt-5 rounded-lg border border-edge/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Second-agent memory</span>
          {run.memory?.reusedBadge ? (
            <Badge tone="accent">memory reused · {run.memory.inheritedFrom.length} CID(s)</Badge>
          ) : (
            <Badge tone="neutral">no inherited memory</Badge>
          )}
        </div>
        {run.memory?.inheritedFrom.length ? (
          <ul className="mt-2 space-y-1">
            {run.memory.inheritedFrom.map((cid) => (
              <li key={cid} className="mono flex items-center gap-2 text-[11px] text-slate-400">
                <span className="text-slate-500">parent</span>
                <span className="break-all">{shorten(cid, 18, 8)}</span>
                <CopyButton value={cid} />
              </li>
            ))}
          </ul>
        ) : null}
        {run.memory?.lessons.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-400">
            {run.memory.lessons.slice(0, 3).map((lesson) => (
              <li key={lesson}>{lesson}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-3 rounded-lg border border-edge/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Settlement · Base Sepolia</span>
          {run.settlement ? (
            <Badge tone="good">reward {formatWei(run.settlement.rewardWei)}</Badge>
          ) : (
            <Badge tone="warn">not settled (no chain credentials)</Badge>
          )}
        </div>
        {run.settlement ? (
          <div className="mt-2 space-y-1 text-[11px] text-slate-400">
            <div className="mono flex flex-wrap items-center gap-2">
              <span className="text-slate-500">tx</span>
              <a
                href={run.settlement.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-accent hover:underline"
              >
                {run.settlement.txHash}
              </a>
              <CopyButton value={run.settlement.txHash} />
            </div>
            <div className="mono">registry {run.settlement.contractAddress}</div>
          </div>
        ) : (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Set <code className="mono">DEPLOYER_PRIVATE_KEY</code> and{' '}
            <code className="mono">REGISTRY_ADDRESS</code> in the worker <code className="mono">.env</code>{' '}
            to submit the primary proof and receive the escrowed testnet reward. The proof and CID
            above are already valid without a chain.
          </p>
        )}
      </div>

      <p className="mt-3 text-[10px] text-slate-600">worker {WORKER_ORIGIN}</p>
    </section>
  );
}
