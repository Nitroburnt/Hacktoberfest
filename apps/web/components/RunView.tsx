'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, WORKER_ORIGIN } from '@/lib/api';
import type { RunRecord, StreamEvent } from '@/lib/types';
import { Badge, StatusBadge } from './Badge';
import { DiffPanel } from './DiffPanel';
import { ExecutionTree } from './ExecutionTree';
import { MemorySettlement } from './MemorySettlement';
import { MetricsPanel } from './MetricsPanel';
import { ProofPanel } from './ProofPanel';
import { RunTimeline } from './RunTimeline';

export function RunView({
  initialRun,
  sample = false,
}: {
  initialRun: RunRecord;
  sample?: boolean;
}) {
  const [run, setRun] = useState<RunRecord>(initialRun);
  const [streamState, setStreamState] = useState<'live' | 'connecting' | 'offline' | 'closed'>(
    sample ? 'offline' : 'connecting',
  );
  const [eventCount, setEventCount] = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTerminal = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api.run(initialRun.id);
      setRun(next);
    } catch {
      setStreamState('offline');
    }
  }, [initialRun.id]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, 350);
  }, [refresh]);

  useEffect(() => {
    if (sample) return;
    const source = new EventSource(`${WORKER_ORIGIN}/api/runs/${initialRun.id}/stream`);
    source.onopen = () => setStreamState('live');
    source.onmessage = (message) => {
      let event: StreamEvent;
      try {
        event = JSON.parse(message.data) as StreamEvent;
      } catch {
        return;
      }
      setEventCount((count) => count + 1);
      scheduleRefresh();
      if ((event.type === 'done' || event.type === 'error') && !lastTerminal.current) {
        lastTerminal.current = true;
        void refresh().finally(() => {
          source.close();
          setStreamState('closed');
        });
      }
    };
    source.onerror = () => setStreamState('offline');
    return () => {
      source.close();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [initialRun.id, refresh, sample, scheduleRefresh]);

  const scores = run.versions.map((v) => v.score?.total ?? 0);
  const best = scores.length ? Math.max(...scores) : 0;

  return (
    <div className="space-y-5">
      {sample ? (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          Worker offline — showing the saved sample run (no API keys or chain required).
        </div>
      ) : null}
      {run.error ? (
        <div className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
          {run.error}
        </div>
      ) : null}

      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-white">{run.taskId}</h1>
              <StatusBadge status={run.status} />
              <Badge tone={streamState === 'live' ? 'good' : 'neutral'}>{streamState}</Badge>
              {eventCount ? <Badge tone="neutral">{eventCount} live events</Badge> : null}
            </div>
            <p className="mono mt-1 text-[11px] text-slate-500">{run.id}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <Badge tone="accent">generator {run.models.generator}</Badge>
              <Badge tone="accent">critic {run.models.critic}</Badge>
              <Badge tone="neutral">best {best}/100</Badge>
              <Badge tone="neutral">{run.proofs.length} proof(s)</Badge>
              {run.usage.costUsd === 0 ? <Badge tone="warn">mock LLM</Badge> : null}
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-500">
            <div className="mono">rubric {run.rubricDigest.slice(0, 16)}…</div>
            <div className="mono">task {run.taskDigest.slice(0, 16)}…</div>
            <div className="mt-2">
              <Link href="/registry" className="text-accent hover:underline">
                registry →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <RunTimeline stages={run.stages} status={run.status} />
        <ExecutionTree run={run} />
      </div>

      <MetricsPanel run={run} />

      <DiffPanel run={run} />

      <div className="grid gap-5 lg:grid-cols-2">
        <ProofPanel run={run} />
        <MemorySettlement run={run} />
      </div>

      <section className="panel p-5">
        <h2 className="panel-title mb-3">Reviewer critiques (sanitized)</h2>
        <div className="space-y-3">
          {run.critiques.map((entry) => (
            <div key={entry.forVersion} className="rounded-lg border border-edge/70 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">after {entry.forVersion}</Badge>
                <Badge
                  tone={
                    entry.critique.severity === 'high'
                      ? 'bad'
                      : entry.critique.severity === 'med'
                        ? 'warn'
                        : 'good'
                  }
                >
                  {entry.critique.severity}
                </Badge>
                <span className="mono text-[11px] text-slate-500">
                  confidence {entry.critique.confidence.toFixed(2)}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{entry.critique.defect}</p>
              <p className="mt-1 text-xs text-slate-500">{entry.critique.suggested_change}</p>
            </div>
          ))}
          {!run.critiques.length ? (
            <p className="text-sm text-slate-500">no critiques yet</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
