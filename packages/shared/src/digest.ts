import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export interface DigestFile {
  /** Repo-relative path; included in the digest so renaming is a change. */
  path: string;
  content: string;
}

/**
 * Freeze digest = SHA256 over sorted (path, SHA256(content)) pairs.
 * Editing any test file or the rubric changes the digest, which is what the
 * circuit's public `rubricDigest` input commits to.
 */
export function computeBenchmarkDigest(files: DigestFile[]): string {
  const lines = files
    .map((f) => `${f.path}:${sha256Hex(f.content)}`)
    .sort()
    .join('\n');
  return sha256Hex(`autoevolve-benchmark-v1\n${lines}`);
}

export function frozenRubricPath(): string {
  return join(HERE, 'frozen/rubric.json');
}

export function frozenTaskSpecPath(): string {
  return join(HERE, 'frozen/frozen_task_spec.json');
}

/** All benchmark test sources, discovered from the repo, sorted by path. */
export function benchmarkTestFiles(): DigestFile[] {
  const dir = join(REPO_ROOT, 'benchmark/tests');
  const out: DigestFile[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.py') && !name.endsWith('.txt')) continue;
    const path = join(dir, name);
    out.push({ path: relative(REPO_ROOT, path).replaceAll('\\', '/'), content: readFileSync(path, 'utf8') });
  }
  return out;
}

/** Current digest of the running benchmark suite. */
export function currentBenchmarkDigest(): string {
  const rubric = readFileSync(frozenRubricPath(), 'utf8');
  return computeBenchmarkDigest([
    { path: 'packages/shared/src/frozen/rubric.json', content: rubric },
    ...benchmarkTestFiles(),
  ]);
}

/**
 * Tamper detection: recompute the digest and compare with the value frozen at
 * setup time (packages/shared/src/frozen/benchmark_digest.txt).
 */
export function verifyFrozenBenchmark(): { ok: boolean; expected: string; actual: string } {
  const expected = readFileSync(join(HERE, 'frozen/benchmark_digest.txt'), 'utf8').trim();
  const actual = currentBenchmarkDigest();
  return { ok: expected === actual, expected, actual };
}
