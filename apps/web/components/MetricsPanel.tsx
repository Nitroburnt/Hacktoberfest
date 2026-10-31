import type { RunRecord } from '@/lib/types';
import { Badge } from './Badge';

const toneFor = (delta: number | null) =>
  delta === null ? 'neutral' : delta > 0 ? 'good' : delta < 0 ? 'bad' : 'neutral';

export function MetricsPanel({ run }: { run: RunRecord }) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="panel-title">Metrics · frozen rubric</h2>
        <Badge tone="neutral">total = f×8 + e×3 + static</Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="pb-2 pr-4">Version</th>
              <th className="pb-2 pr-4">functional /10</th>
              <th className="pb-2 pr-4">edge /5</th>
              <th className="pb-2 pr-4">static /5</th>
              <th className="pb-2 pr-4">total</th>
              <th className="pb-2 pr-4">Δ</th>
              <th className="pb-2">safety</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge/70">
            {run.versions.map((version, index) => {
              const prev = index > 0 ? run.versions[index - 1].score?.total ?? 0 : null;
              const total = version.score?.total ?? 0;
              const delta = prev === null ? null : total - prev;
              return (
                <tr key={version.version} className="text-slate-300">
                  <td className="py-2 pr-4 font-medium text-white">{version.version}</td>
                  <td className="py-2 pr-4 mono">{version.score?.functional ?? '—'}</td>
                  <td className="py-2 pr-4 mono">{version.score?.edge ?? '—'}</td>
                  <td className="py-2 pr-4 mono">{version.score?.static ?? '—'}</td>
                  <td className="py-2 pr-4 mono text-accent">{version.score ? total : '—'}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={toneFor(delta)}>{delta === null ? 'baseline' : delta > 0 ? `+${delta}` : delta}</Badge>
                  </td>
                  <td className="py-2">
                    <Badge tone={version.score?.safety ? 'good' : 'bad'}>
                      {version.score?.safety ? 'PASS' : 'FAIL'}
                    </Badge>
                  </td>
                </tr>
              );
            })}
            {!run.versions.length ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-500">
                  no versions scored yet
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-3 text-xs text-slate-400 sm:grid-cols-3">
        <div className="rounded-lg border border-edge/70 p-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Tokens</div>
          <div className="mono mt-1 text-slate-200">
            {run.usage.promptTokens} in / {run.usage.completionTokens} out
          </div>
        </div>
        <div className="rounded-lg border border-edge/70 p-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">LLM spend</div>
          <div className="mono mt-1 text-slate-200">${run.usage.costUsd.toFixed(4)}</div>
        </div>
        <div className="rounded-lg border border-edge/70 p-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Proving time</div>
          <div className="mono mt-1 text-slate-200">
            {run.proofs.reduce((sum, p) => sum + p.provingMs, 0)} ms
          </div>
        </div>
      </div>
    </section>
  );
}
