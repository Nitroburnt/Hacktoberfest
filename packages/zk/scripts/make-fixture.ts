/**
 * Generate packages/zk/test/fixtures/validProof.json:
 * a real Groth16 proof for the 60 -> 85 transition with a manifest commitment
 * of 333 (matching the fixture inputs in the frozen contract test).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { proveImprovement, type CircuitInputs } from '../src';

const ZK_DIR = resolve(import.meta.dirname, '..');

async function main() {
  // 60 = 6*8 + 2*3 + 6, 85 = 9*8 + 3*3 + 4. These are exactly the values the
  // frozen circuit test proves, reused here so the contract fixture verifies
  // against the same verification key.
  const inputs: CircuitInputs = {
    f_old: 6,
    e_old: 2,
    s_old: 6,
    f_new: 9,
    e_new: 3,
    s_new: 4,
    oldScore: 60,
    newScore: 85,
    rubricDigest: '12345',
    versionCommitOld: '111',
    versionCommitNew: '222',
    transitionNonce: '1',
    manifestCommit: '333',
  };

  const bundle = await proveImprovement(inputs);
  if (!bundle.localVerified) throw new Error('fixture proof failed local verification');

  const fixture = {
    description:
      'Valid improvement 60 -> 85, rubricDigest 12345, commits 111/222, nonce 1, manifestCommit 333',
    circuit: 'packages/zk/circuits/improvement.circom',
    inputs,
    publicSignals: bundle.publicSignals,
    manifestCommitment: '333',
    proof: {
      a: [bundle.proof.pi_a[0], bundle.proof.pi_a[1]],
      b: [
        [bundle.proof.pi_b[0][1], bundle.proof.pi_b[0][0]],
        [bundle.proof.pi_b[1][1], bundle.proof.pi_b[1][0]],
      ],
      c: [bundle.proof.pi_c[0], bundle.proof.pi_c[1]],
    },
    provingMs: bundle.provingMs,
  };

  const dir = join(ZK_DIR, 'test/fixtures');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'validProof.json'), `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`wrote fixture (proving ${bundle.provingMs}ms):`);
  console.log(`  publicSignals: [${bundle.publicSignals.join(', ')}]`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
