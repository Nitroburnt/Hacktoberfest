
// Phase 3 ZK Circuit Bias-Free Tests
// These tests use snarkjs directly, no LLM scoring

import { expect, test } from 'vitest';
import * as snarkjs from 'snarkjs';
import fs from 'fs';

const wasm = 'packages/zk/build/improvement_js/improvement.wasm';
const zkey = 'packages/zk/build/improvement_final.zkey';
const vkey = JSON.parse(fs.readFileSync('packages/zk/build/verification_key.json','utf8'));

async function prove(oldScore, newScore, f_old, e_old, s_old, f_new, e_new, s_new) {
  const input = {
    oldScore, newScore,
    f_old, e_old, s_old, f_new, e_new, s_new,
    rubricDigest: 12345, // placeholder field element
    versionCommitOld: 111,
    versionCommitNew: 222,
    transitionNonce: 1,
    manifestCommit: 333
  };
  const {proof, publicSignals} = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  return {proof, publicSignals, ok};
}

test('T3.1 valid 60->85 should PASS', async () => {
  const {ok} = await prove(60,85, 6,2,6, 9,3,4);
  expect(ok).toBe(true);
});

test('T3.2 equal 80->80 should FAIL constraint', async () => {
  await expect(prove(80,80, 8,3,7, 8,3,7)).rejects.toThrow();
});

test('T3.3 decreasing 90->70 should FAIL', async () => {
  await expect(prove(90,70, 9,4,6, 6,2,6)).rejects.toThrow();
});

test('T3.4 out-of-range f_old=15 should FAIL', async () => {
  await expect(prove(50,80, 15,0,0, 8,3,4)).rejects.toThrow();
});

test('T3.5 tampered public signal should FAIL verify', async () => {
  const {proof, publicSignals} = await prove(60,85, 6,2,6, 9,3,4);
  publicSignals[0] = '999'; // tamper oldScore
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  expect(ok).toBe(false);
});
