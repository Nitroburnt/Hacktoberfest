/// <reference path="./snarkjs.d.ts" />
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CircuitInputs } from './witness';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ZK_DIR = resolve(HERE, '..');
export const BUILD_DIR = join(ZK_DIR, 'build');
export const WASM_PATH = join(BUILD_DIR, 'improvement_js/improvement.wasm');
export const ZKEY_PATH = join(BUILD_DIR, 'improvement_final.zkey');
export const VKEY_PATH = join(BUILD_DIR, 'verification_key.json');

export interface Groth16Proof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
}

export interface ProofBundle {
  proof: Groth16Proof;
  publicSignals: string[];
  provingMs: number;
  localVerified: boolean;
}

async function snarkjs() {
  // Dynamic import: snarkjs is CJS and pulls in a large dependency tree.
  return (await import('snarkjs')) as unknown as typeof import('snarkjs');
}

/** Read the verification key from disk (no ESM JSON import: Windows paths). */
export function readVerificationKey(): unknown {
  return JSON.parse(readFileSync(VKEY_PATH, 'utf8'));
}

export function assertArtifacts(): void {
  for (const [label, path] of [
    ['wasm', WASM_PATH],
    ['zkey', ZKEY_PATH],
    ['verification key', VKEY_PATH],
  ] as const) {
    if (!existsSync(path)) {
      throw new Error(`missing ZK artifact (${label}): ${path}. Run \`pnpm zk:build\`.`);
    }
  }
}

/** Generate a Groth16 proof and verify it locally before returning. */
export async function proveImprovement(inputs: CircuitInputs): Promise<ProofBundle> {
  assertArtifacts();
  const snark = await snarkjs();
  const started = Date.now();
  const { proof, publicSignals } = await snark.groth16.fullProve(
    inputs as unknown as Record<string, unknown>,
    WASM_PATH,
    ZKEY_PATH,
  );
  const provingMs = Date.now() - started;
  const localVerified = await snark.groth16.verify(
    readVerificationKey() as never,
    publicSignals,
    proof,
  );
  return { proof: proof as unknown as Groth16Proof, publicSignals, provingMs, localVerified };
}

export async function verifyLocally(proof: Groth16Proof, publicSignals: string[]): Promise<boolean> {
  const snark = await snarkjs();
  return snark.groth16.verify(readVerificationKey() as never, publicSignals, proof);
}

/** Convert a snarkjs proof into the calldata shape ImprovementRegistry expects. */
export function proofToSolidity(proof: Groth16Proof): {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
} {
  return {
    a: [proof.pi_a[0], proof.pi_a[1]],
    b: [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]],
    ],
    c: [proof.pi_c[0], proof.pi_c[1]],
  };
}
