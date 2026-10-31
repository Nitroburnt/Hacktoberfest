'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { RunRecord } from '@/lib/types';
import { Badge } from './Badge';

// Monaco touches `window` at import time, so it must never run during SSR.
const MonacoDiff = dynamic(() => import('./MonacoDiff').then((mod) => mod.MonacoDiff), {
  ssr: false,
  loading: () => (
    <div className="grid h-[420px] place-items-center rounded-lg border border-edge/70 text-sm text-slate-500">
      loading diff viewer…
    </div>
  ),
});

export function DiffPanel({ run }: { run: RunRecord }) {
  const pairs = run.versions.slice(1).map((version, index) => ({
    id: `${run.versions[index].version}->${version.version}`,
    from: run.versions[index],
    to: version,
  }));
  const [active, setActive] = useState(0);
  const current = pairs[Math.min(active, Math.max(pairs.length - 1, 0))];

  if (!pairs.length) {
    return (
      <section className="panel p-5 text-sm text-slate-500">
        Diff appears when a second version is generated.
      </section>
    );
  }

  return (
    <section className="panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="panel-title">Diff · {current.from.version} → {current.to.version}</h2>
        <div className="flex items-center gap-2">
          {pairs.map((pair, index) => (
            <button
              key={pair.id}
              type="button"
              onClick={() => setActive(index)}
              className={`rounded border px-2 py-1 text-[11px] ${
                index === active
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-edge text-slate-400 hover:text-white'
              }`}
            >
              {pair.from.version} → {pair.to.version}
            </button>
          ))}
          <Badge tone="neutral">
            {current.to.diffAdded ?? 0} added / {current.to.diffRemoved ?? 0} removed
          </Badge>
        </div>
      </div>

      <MonacoDiff original={current.from.code} modified={current.to.code} />

      {current.to.changelog ? (
        <details className="mt-3 rounded-lg border border-edge/70 bg-black/20 p-3">
          <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-slate-500">
            deterministic changelog (git-style diff, not an LLM)
          </summary>
          <pre className="mono mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-slate-400">
            {current.to.changelog}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
