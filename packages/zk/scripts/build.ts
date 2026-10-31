/**
 * Reproducible ZK build.
 *
 *   circom compile -> powers of tau (2^14) -> groth16 setup -> contribute
 *   -> verification_key.json -> Groth16Verifier.sol
 *
 * The large intermediates (*.ptau, *_0000.zkey) are gitignored; the final
 * zkey, wasm, vkey and verifier are committed so judges never have to rebuild.
 *
 * Usage: pnpm zk:build   (CIRCOM_BIN overrides the circom binary path)
 */
import { execSync, type ExecSyncOptions } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ZK_DIR = resolve(import.meta.dirname, '..');
const ROOT = resolve(ZK_DIR, '../..');
const BUILD = join(ZK_DIR, 'build');
const CIRCUIT = join(ZK_DIR, 'circuits/improvement.circom');
const PTAU = join(BUILD, 'pot14_final.ptau');
const ZKEY_0 = join(BUILD, 'improvement_0000.zkey');
const ZKEY_1 = join(BUILD, 'improvement_0001.zkey');
const ZKEY_FINAL = join(BUILD, 'improvement_final.zkey');

const CIRCOM =
  process.env.CIRCOM_BIN ??
  join(ROOT, '.tools', process.platform === 'win32' ? 'circom.exe' : 'circom');

function run(cmd: string, cwd = ROOT) {
  console.log(`$ ${cmd}`);
  const options: ExecSyncOptions = {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
  };
  execSync(cmd, options);
}

function quote(p: string) {
  return `"${p}"`;
}

mkdirSync(BUILD, { recursive: true });

/* 1. compile ------------------------------------------------------------- */
run(
  [
    quote(CIRCOM),
    quote(CIRCUIT),
    '--r1cs --wasm --sym',
    '-l',
    quote(join(ZK_DIR, 'node_modules')),
    '-o',
    quote(BUILD),
  ].join(' '),
);

const r1cs = join(BUILD, 'improvement.r1cs');
if (!existsSync(join(BUILD, 'improvement_js/improvement.wasm'))) {
  throw new Error('circom did not produce build/improvement_js/improvement.wasm');
}
run(`npx snarkjs r1cs info ${quote(r1cs)}`);

/* 2. powers of tau (2^14) ------------------------------------------------ */
if (!existsSync(PTAU)) {
  run(`npx snarkjs powersoftau new bn128 14 ${quote(join(BUILD, 'pot14_0000.ptau'))} -v`);
  run(
    `npx snarkjs powersoftau contribute ${quote(join(BUILD, 'pot14_0000.ptau'))} ` +
      `${quote(join(BUILD, 'pot14_0001.ptau'))} --name="AutoEvolve Phase1" ` +
      `-e="autoevolve-circuit-v1-${Date.now()}" -v`,
  );
  run(
    `npx snarkjs powersoftau prepare phase2 ${quote(join(BUILD, 'pot14_0001.ptau'))} ` +
      `${quote(PTAU)} -v`,
  );
}

/* 3. groth16 setup + contribution --------------------------------------- */
run(`npx snarkjs groth16 setup ${quote(r1cs)} ${quote(PTAU)} ${quote(ZKEY_0)}`);
run(
  `npx snarkjs zkey contribute ${quote(ZKEY_0)} ${quote(ZKEY_1)} ` +
    `--name="AutoEvolve circuit v1" -e="autoevolve-zkey-${Date.now()}" -v`,
);
run(`npx snarkjs zkey export verificationkey ${quote(ZKEY_1)} ${quote(join(BUILD, 'verification_key.json'))}`);
copyFileSync(ZKEY_1, ZKEY_FINAL);
run(`npx snarkjs zkey verify ${quote(r1cs)} ${quote(PTAU)} ${quote(ZKEY_FINAL)}`);

/* 4. solidity verifier --------------------------------------------------- */
const solidityOut = join(BUILD, 'Groth16Verifier.sol');
run(`npx snarkjs zkey export solidityverifier ${quote(ZKEY_FINAL)} ${quote(solidityOut)}`);
const solidity = readFileSync(solidityOut, 'utf8');
mkdirSync(join(ROOT, 'packages/contracts/contracts'), { recursive: true });
copyFileSync(solidityOut, join(ROOT, 'packages/contracts/contracts/Groth16Verifier.sol'));

const version = solidity.match(/pragma solidity [^;]+;/)?.[0] ?? 'pragma solidity ^0.8.0;';
console.log(`\nverifier exported (${version})`);
console.log('artifacts:');
for (const f of ['improvement_js/improvement.wasm', 'improvement_final.zkey', 'verification_key.json']) {
  console.log(`  packages/zk/build/${f}`);
}
