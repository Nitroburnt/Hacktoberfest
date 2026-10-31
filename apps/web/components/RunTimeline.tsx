import type { StageRecord } from '@/lib/types';

export function RunTimeline({ stages, status }: { stages: StageRecord[]; status: string }) {
  const running = !['done', 'failed'].includes(status);
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="panel-title">Run timeline (SSE)</h2>
        <span className="text-[11px] text-slate-500">{stages.length} events</span>
      </div>
      <ol className="relative space-y-3 border-l border-edge pl-5">
        {stages.map((stage, index) => {
          const last = index === stages.length - 1;
          const active = last && running;
          return (
            <li key={`${stage.stage}-${index}`} className="relative">
              <span
                className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border ${
                  active
                    ? 'animate-pulse border-accent bg-accent'
                    : 'border-edge bg-slate-600'
                }`}
              />
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-sm text-slate-200">{stage.stage}</span>
                <span className="mono text-slate-500">{stage.latencyMs} ms</span>
                {stage.detail ? (
                  <span className="text-[11px] text-slate-500">{stage.detail}</span>
                ) : null}
              </div>
            </li>
          );
        })}
        {!stages.length ? <li className="text-sm text-slate-500">waiting for events…</li> : null}
      </ol>
    </section>
  );
}
