import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { calculateScore, type ScoreReport } from '@autoevolve/shared';

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS = join(HERE, 'harness.py');

export interface BenchmarkRaw {
  functional: number;
  edge: number;
  static: number;
  safety: boolean;
  safetyReason: string | null;
  failureIds: string[];
  detail?: Record<string, unknown>;
}

export interface BenchmarkResult {
  report: ScoreReport;
  raw: BenchmarkRaw;
  runner: 'docker' | 'local';
  durationMs: number;
}

export interface RunBenchmarkOptions {
  runner?: 'docker' | 'local';
  image?: string;
  timeoutMs?: number;
  pythonBin?: string;
}

function exec(
  cmd: string,
  args: string[],
  input: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${cmd} exited with ${code}: ${stderr.slice(-800)}`));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
    child.stdin.end(input);
  });
}

function parseReport(stdout: string): BenchmarkRaw {
  const trimmed = stdout.trim();
  // The harness prints exactly one JSON document; be tolerant of a leading
  // Docker warning line just in case.
  const start = trimmed.indexOf('{');
  if (start === -1) throw new Error(`benchmark produced no JSON: ${trimmed.slice(0, 400)}`);
  const raw = JSON.parse(trimmed.slice(start)) as BenchmarkRaw;
  if (
    typeof raw.functional !== 'number' ||
    typeof raw.edge !== 'number' ||
    typeof raw.static !== 'number' ||
    typeof raw.safety !== 'boolean'
  ) {
    throw new Error(`benchmark returned malformed report: ${trimmed.slice(0, 400)}`);
  }
  return raw;
}

/**
 * Run one candidate file through the frozen benchmark and return a scored
 * report. Scores come from scorer.ts, never from the LLM or the harness.
 */
export async function runBenchmark(
  code: string,
  options: RunBenchmarkOptions = {},
): Promise<BenchmarkResult> {
  const runner = options.runner ?? (process.env.BENCHMARK_RUNNER as 'docker' | 'local') ?? 'docker';
  const image = options.image ?? process.env.BENCHMARK_IMAGE ?? 'autoevolve-bench';
  const timeoutMs = options.timeoutMs ?? 60_000;
  const started = Date.now();

  const { stdout } =
    runner === 'docker'
      ? await exec('docker', ['run', '--rm', '--network', 'none', '-i', image, '--stdin'], code, timeoutMs)
      : await exec(
          options.pythonBin ?? process.env.PYTHON_BIN ?? 'python',
          [HARNESS, '--stdin'],
          code,
          timeoutMs,
        );

  const raw = parseReport(stdout);
  const report = calculateScore({
    functional: raw.functional,
    edge: raw.edge,
    static: raw.static,
    safety: raw.safety,
    ...(raw.safetyReason ? { safetyReason: raw.safetyReason } : {}),
    failureIds: raw.failureIds ?? [],
  });

  return { report, raw, runner, durationMs: Date.now() - started };
}

/** Run the three frozen fixtures plus the reference solution. */
export async function scoreFrozenFixtures(options: RunBenchmarkOptions = {}) {
  const { readFile } = await import('node:fs/promises');
  const fixturesDir = resolve(HERE, '../AutoEvolve_Test_Suite/AutoEvolve_Test_Suite/benchmark_fixtures');
  const files = {
    V1: join(fixturesDir, 'V1_buggy.py'),
    V2: join(fixturesDir, 'V2_fixed.py'),
    V3: join(fixturesDir, 'V3_improved.py'),
    reference: join(HERE, 'reference_solution.py'),
  } as const;

  const out: Record<string, BenchmarkResult> = {};
  for (const [key, path] of Object.entries(files)) {
    out[key] = await runBenchmark(await readFile(path, 'utf8'), options);
  }
  return out as Record<keyof typeof files, BenchmarkResult>;
}

/* --------------------------------- CLI ---------------------------------- */

async function main() {
  const args = process.argv.slice(2);
  const runnerIndex = args.indexOf('--runner');
  const runner = runnerIndex >= 0 ? (args[runnerIndex + 1] as 'docker' | 'local') : undefined;
  const codeIndex = args.indexOf('--code');
  const { readFile } = await import('node:fs/promises');

  if (codeIndex >= 0) {
    const code = await readFile(args[codeIndex + 1], 'utf8');
    const result = await runBenchmark(code, { runner });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const results = await scoreFrozenFixtures({ runner });
  for (const [name, result] of Object.entries(results)) {
    console.log(
      `${name.padEnd(10)} total=${String(result.report.total).padStart(3)} ` +
        `(f=${result.report.functional} e=${result.report.edge} s=${result.report.static} ` +
        `safety=${result.report.safety}) via ${result.runner} in ${result.durationMs}ms`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
