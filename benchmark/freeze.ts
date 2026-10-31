/**
 * Phase 0.3-0.5: copy the frozen task spec + rubric into the shared package and
 * compute the SHA256 benchmark digest that the ZK circuit commits to.
 *
 * Run once at setup time: `tsx benchmark/freeze.ts`
 * Re-running after editing benchmark/tests or the rubric intentionally changes
 * the digest (that is the tamper signal).
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { benchmarkTestFiles, computeBenchmarkDigest, sha256Hex } from '@autoevolve/shared';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FROZEN_SRC = join(ROOT, 'AutoEvolve_Test_Suite/AutoEvolve_Test_Suite');
const FROZEN_DEST = join(ROOT, 'packages/shared/src/frozen');

mkdirSync(FROZEN_DEST, { recursive: true });
for (const file of ['rubric.json', 'frozen_task_spec.json']) {
  copyFileSync(join(FROZEN_SRC, file), join(FROZEN_DEST, file));
}

const rubricText = readFileSync(join(FROZEN_DEST, 'rubric.json'), 'utf8');
const taskText = readFileSync(join(FROZEN_DEST, 'frozen_task_spec.json'), 'utf8');

const rubricDigest = sha256Hex(rubricText);
const taskDigest = sha256Hex(taskText);
const benchmarkDigest = computeBenchmarkDigest([
  { path: 'packages/shared/src/frozen/rubric.json', content: rubricText },
  ...benchmarkTestFiles(),
]);

writeFileSync(join(FROZEN_DEST, 'rubric_digest.txt'), `${rubricDigest}\n`);
writeFileSync(join(FROZEN_DEST, 'task_digest.txt'), `${taskDigest}\n`);
writeFileSync(join(FROZEN_DEST, 'benchmark_digest.txt'), `${benchmarkDigest}\n`);

const manifest = {
  rubricVersion: JSON.parse(rubricText).version,
  rubricDigest,
  taskId: JSON.parse(taskText).taskId,
  taskDigest,
  benchmarkDigest,
  testFiles: benchmarkTestFiles().map((f) => f.path),
  frozenAt: new Date().toISOString(),
};
writeFileSync(join(FROZEN_DEST, 'freeze.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// Tooling-only copy for the Python side to read the committed digest.
writeFileSync(join(HERE, 'frozen_digest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`rubricDigest    ${rubricDigest}`);
console.log(`taskDigest      ${taskDigest}`);
console.log(`benchmarkDigest ${benchmarkDigest}`);
console.log(`frozen at ${manifest.frozenAt}`);
