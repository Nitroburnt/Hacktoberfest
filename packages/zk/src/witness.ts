import { cidCommitment, sha256Hex, type ScoreReport } from '@autoevolve/shared';

export interface TransitionCommitments {
  rubricDigest: bigint | string | number;
  versionCommitOld: bigint | string | number;
  versionCommitNew: bigint | string | number;
  transitionNonce: bigint | string | number;
  manifestCommit: bigint | string | number;
}

export interface CircuitInputs {
  f_old: number;
  e_old: number;
  s_old: number;
  f_new: number;
  e_new: number;
  s_new: number;
  oldScore: number;
  newScore: number;
  rubricDigest: string;
  versionCommitOld: string;
  versionCommitNew: string;
  transitionNonce: string;
  manifestCommit: string;
}

const s = (v: bigint | string | number) => BigInt(v).toString();

/**
 * The witness builder. Counts stay private; only scores and commitments become
 * public signals. Refuses transitions that cannot have a valid witness so the
 * failure is a clear error rather than a snarkjs stack trace.
 */
export function buildCircuitInputs(
  oldReport: ScoreReport,
  newReport: ScoreReport,
  commitments: TransitionCommitments,
): CircuitInputs {
  if (!oldReport.safety || !newReport.safety) {
    throw new Error('witness: cannot prove a transition that failed the safety gate');
  }
  if (newReport.total <= oldReport.total) {
    throw new Error(
      `witness: no improvement (${oldReport.total} -> ${newReport.total}); refused before proving`,
    );
  }

  return {
    f_old: oldReport.functional,
    e_old: oldReport.edge,
    s_old: oldReport.static,
    f_new: newReport.functional,
    e_new: newReport.edge,
    s_new: newReport.static,
    oldScore: oldReport.total,
    newScore: newReport.total,
    rubricDigest: s(commitments.rubricDigest),
    versionCommitOld: s(commitments.versionCommitOld),
    versionCommitNew: s(commitments.versionCommitNew),
    transitionNonce: s(commitments.transitionNonce),
    manifestCommit: s(commitments.manifestCommit),
  };
}

/** Deterministic per-run transition id: binds runId, versions and scores. */
export function transitionIdFor(runId: string, oldScore: number, newScore: number): string {
  return sha256Hex(`transition:${runId}:${oldScore}->${newScore}`).slice(0, 32);
}

/** Commitment of a code version (sha256 hex reduced to a field element). */
export function versionCommitment(code: string): bigint {
  const digest = sha256Hex(code);
  return BigInt(`0x${digest}`) % 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
}

/** keccak256(cidString) reduced into the BN254 field — matches cid.ts. */
export function manifestCommitment(cid: string): bigint {
  return cidCommitment(cid);
}
