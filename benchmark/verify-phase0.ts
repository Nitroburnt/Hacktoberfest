/**
 * Phase 0 exit conditions:
 *   T0.1 same candidate file -> identical score on 3 consecutive runs
 *   T0.2 reference solution scores 100 with safety PASS
 *   T0.3 `import os` fails the safety gate (score 0)
 *   T0.4 editing a test file changes the rubric/benchmark digest
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { computeBenchmarkDigest, sha256Hex } from '@autoevolve/shared';
import { runBenchmark } from './runner';

const ROOT = resolve(import.meta.dirname, '..');
const FIXTURES = join(ROOT, 'AutoEvolve_Test_Suite/AutoEvolve_Test_Suite/benchmark_fixtures');
const runner = (process.env.BENCHMARK_RUNNER as 'docker' | 'local') ?? 'docker';

const results: Array<{ id: string; ok: boolean; detail: string }> = [];
function check(id: string, ok: boolean, detail: string) {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}  ${detail}`);
}

async function main() {
  console.log(`runner=${runner}\n`);

  // T0.1 deterministic scoring
  const v1Code = readFileSync(join(FIXTURES, 'V1_buggy.py'), 'utf8');
  const runs = [] as number[];
  for (let i = 0; i < 3; i++) {
    runs.push((await runBenchmark(v1Code, { runner })).report.total);
  }
  check('T0.1', new Set(runs).size === 1, `V1_buggy scores ${runs.join(', ')} on 3 consecutive runs`);

  // T0.2 reference solution = 100
  const reference = await runBenchmark(readFileSync(join(ROOT, 'benchmark/reference_solution.py'), 'utf8'), {
    runner,
  });
  check(
    'T0.2',
    reference.report.total === 100 && reference.report.safety,
    `reference_solution total=${reference.report.total} safety=${reference.report.safety}`,
  );

  // T0.3 safety gate
  const malicious = await runBenchmark('import os\n\ndef parse_transactions(p):\n    return []\n', { runner });
  check(
    'T0.3',
    malicious.report.total === 0 && malicious.report.safety === false,
    `banned import -> total=${malicious.report.total} reason="${malicious.report.safetyReason}"`,
  );

  // T0.4 tamper detection
  const rubric = readFileSync(join(ROOT, 'packages/shared/src/frozen/rubric.json'), 'utf8');
  const testSource = readFileSync(join(ROOT, 'benchmark/tests/functional/test_functional.py'), 'utf8');
  const base = computeBenchmarkDigest([
    { path: 'packages/shared/src/frozen/rubric.json', content: rubric },
    { path: 'benchmark/tests/functional/test_functional.py', content: testSource },
  ]);
  const tampered = computeBenchmarkDigest([
    { path: 'packages/shared/src/frozen/rubric.json', content: rubric },
    { path: 'benchmark/tests/functional/test_functional.py', content: `${testSource}\n# edited\n` },
  ]);
  check('T0.4', base !== tampered, `digest ${base.slice(0, 12)}… -> ${tampered.slice(0, 12)}… after edit`);

  const v1 = await runBenchmark(readFileSync(join(FIXTURES, 'V1_buggy.py'), 'utf8'), { runner });
  const v2 = await runBenchmark(readFileSync(join(FIXTURES, 'V2_fixed.py'), 'utf8'), { runner });
  const v3 = await runBenchmark(readFileSync(join(FIXTURES, 'V3_improved.py'), 'utf8'), { runner });
  console.log(
    `\nfixture scores: V1=${v1.report.total} V2=${v2.report.total} V3=${v3.report.total} ` +
      `(V1<60: ${v1.report.total < 60}, V2>V1: ${v2.report.total > v1.report.total}, ` +
      `V3>=V2: ${v3.report.total >= v2.report.total})`,
  );

  for (const [name, res] of Object.entries({ V1: v1, V2: v2, V3: v3, reference })) {
    const path = join(ROOT, `benchmark/results/${name}.json`);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      path,
      `${JSON.stringify({ fixture: name, runner: res.runner, report: res.report, raw: res.raw, at: new Date().toISOString() }, null, 2)}\n`,
    );
  }

  const digest = readFileSync(join(ROOT, 'packages/shared/src/frozen/benchmark_digest.txt'), 'utf8').trim();
  console.log(`benchmark digest ${digest} (rubric sha256 ${sha256Hex(rubric).slice(0, 16)}…)`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} phase-0 checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
