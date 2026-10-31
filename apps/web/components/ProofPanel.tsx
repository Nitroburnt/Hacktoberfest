import type { ProofRecord, RunRecord } from '@/lib/types';
import { Badge } from './Badge';
import { CopyButton } from './CopyButton';

const SIGNAL_LABELS = [
  'oldScore',
  'newScore',
  'rubricDigest',
  'versionCommitOld',
  'versionCommitNew',
  'transitionNonce',
  'manifestCommitment',
];

function ProofCard({ proof }: { proof: ProofRecord }) {
  return (
    <div className="rounded-lg border border-edge/70 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-white">
          {proof.fromVersion} → {proof.toVersion}{' '}
          <span className="mono text-xs text-slate-400">
            {proof.oldScore} → {proof.newScore}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={proof.localVerified ? 'good' : 'bad'}>
            local {proof.localVerified ? 'PASS' : 'FAIL'}
          </Badge>
          <Badge tone={proof.onChainVerified ? 'good' : 'warn'}>
            on-chain {proof.onChainVerified ? 'PASS' : 'pending'}
          </Badge>
          <Badge tone="neutral">{proof.provingMs} ms</Badge>
        </div>
      </div>

      <div className="mono mt-3 flex items-center gap-2 text-[11px] text-slate-500">
        <span>transition {proof.transitionId}</span>
        <CopyButton value={proof.transitionId} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {proof.publicSignals.map((signal, index) => (
          <div key={SIGNAL_LABELS[index] ?? index} className="rounded border border-edge/60 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              {SIGNAL_LABELS[index] ?? `signal ${index}`}
            </div>
            <div className="mono truncate text-slate-300" title={signal}>
              {signal}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProofPanel({ run }: { run: RunRecord }) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="panel-title">Proof · Groth16 / BN254</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">circom 2</Badge>
          <Badge tone="neutral">{run.proofs.length} proof(s)</Badge>
          <Badge tone="neutral">rubric digest {run.rubricDigest.slice(0, 10)}…</Badge>
        </div>
      </div>

      <div className="space-y-3">
        {run.proofs.map((proof) => (
          <ProofCard key={proof.transitionId} proof={proof} />
        ))}
        {!run.proofs.length ? (
          <p className="text-sm text-slate-500">
            No proof yet. A proof is only produced for a strict score increase between adjacent
            versions.
          </p>
        ) : null}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Public inputs only. The metric witness (functional / edge / static counts), the system
        prompt and the LLM outputs never leave the prover. Claim: score arithmetic validity and
        strict increase — not proof of LLM inference.
      </p>
    </section>
  );
}
