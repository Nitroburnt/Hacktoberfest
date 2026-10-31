'use client';

import { useMemo } from 'react';
import ReactFlow, { Background, Controls, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import type { RunRecord } from '@/lib/types';

export function ExecutionTree({ run }: { run: RunRecord }) {
  const { nodes, edges } = useMemo(() => {
    const versions = run.versions;
    const nodes: Node[] = versions.map((version, index) => {
      const score = version.score?.total ?? 0;
      const prev = index > 0 ? versions[index - 1].score?.total ?? 0 : null;
      const delta = prev === null ? null : score - prev;
      return {
        id: version.version,
        position: { x: index * 240, y: 20 },
        data: {
          label: (
            <div className="w-[190px] text-left">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{version.version}</span>
                <span className="mono text-xs text-accent">{score}/100</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                f{version.score?.functional ?? 0} · e{version.score?.edge ?? 0} · s
                {version.score?.static ?? 0}
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                <span>{version.codeHash.slice(0, 10)}…</span>
                {delta !== null ? (
                  <span className={delta > 0 ? 'text-good' : 'text-slate-400'}>
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                ) : (
                  <span>baseline</span>
                )}
              </div>
            </div>
          ),
        },
        style: {
          width: 210,
          padding: 12,
          borderRadius: 12,
          border: '1px solid #24303f',
          background: '#0d1117',
          color: '#e2e8f0',
        },
      };
    });

    const edges: Edge[] = [];
    for (let i = 1; i < versions.length; i++) {
      const critique = run.critiques.find((c) => c.forVersion === versions[i - 1].version)?.critique;
      const delta =
        (versions[i].score?.total ?? 0) - (versions[i - 1].score?.total ?? 0);
      const label = critique
        ? `${delta > 0 ? `+${delta}` : delta} · ${critique.severity} · ${critique.defect.slice(0, 34)}${
            critique.defect.length > 34 ? '…' : ''
          }`
        : `${delta > 0 ? `+${delta}` : delta}`;
      edges.push({
        id: `${versions[i - 1].version}-${versions[i].version}`,
        source: versions[i - 1].version,
        target: versions[i].version,
        animated: true,
        label,
        labelBgPadding: [6, 3],
        labelBgStyle: { fill: '#0d1117', stroke: '#24303f' },
        labelStyle: { fill: '#94a3b8', fontSize: 10 },
        style: { stroke: '#334155' },
      });
    }
    return { nodes, edges };
  }, [run]);

  if (!run.versions.length) {
    return (
      <section className="panel grid h-56 place-items-center p-5 text-sm text-slate-500">
        execution tree appears after the first version is scored
      </section>
    );
  }

  return (
    <section className="panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="panel-title">Execution tree</h2>
        <span className="text-[11px] text-slate-500">edges = critique + score delta</span>
      </div>
      <div className="h-56 rounded-lg border border-edge/70 bg-black/20">
        <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}>
          <Background color="#1b2430" gap={18} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  );
}
