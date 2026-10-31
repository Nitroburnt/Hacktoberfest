/**
 * One-click end-to-end demo.
 *
 *   pnpm demo:clean            # mock LLM if no FEATHERLESS_API_KEY
 *   MOCK_LLM=0 pnpm demo:clean # real Featherless calls (needs key + credit)
 *
 * What it does:
 *   1. verifies the frozen benchmark digest (tamper check)
 *   2. runs a full V1 -> critique -> V2 -> critique -> V3 loop
 *   3. proves every strictly-improving adjacent transition in Groth16
 *   4. sanitizes, publishes and fetch-back-validates the manifest (IPFS/local)
 *   5. settles the primary proof on Base Sepolia when chain credentials exist
 *   6. runs a second agent on the published memory and prints what it inherited
 *   7. writes the fallback sample run used by the dashboard
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyFrozenBenchmark } from '@autoevolve/shared';
import { config, isChainConfigured } from '../apps/worker/src/config';
import { saveRun, listRuns } from '../apps/worker/src/db';
import { createRunRecord, executeRun } from '../apps/worker/src/loop';
import { fetchRelevantMemories } from '../apps/worker/src/memory';
import type { PublicRunRecord } from '@autoevolve/shared';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function summarize(run: PublicRunRecord) {
  const scores = run.versions.map((v) => `${v.version}=${v.score?.total ?? '—'}`);
  const proofs = run.proofs.map(
    (p) => `${p.fromVersion}->${p.toVersion}:${p.oldScore}->${p.newScore}(${p.provingMs}ms,${
      p.localVerified ? 'verified' : 'FAILED'
    })`,
  );
  return {
    runId: run.id,
    status: run.status,
    scores,
    proofs,
    cid: run.publication?.cid ?? null,
    provider: run.publication?.provider ?? null,
    tx: run.settlement?.txHash ?? null,
    memory: run.memory,
    usage: run.usage,
    error: run.error,
  };
}

async function main() {
  console.log('AutoEvolve demo');
  console.log(`  mock LLM      ${config.llm.mock}${config.llm.mockReason ? ` (${config.llm.mockReason})` : ''}`);
  console.log(`  benchmark     ${config.benchmark.runner}`);
  console.log(`  chain         ${isChainConfigured() ? 'Base Sepolia' : 'not configured'}`);
  console.log(`  ipfs          ${config.ipfs.provider}\n`);

  const frozen = verifyFrozenBenchmark();
  if (!frozen.ok) {
    throw new Error(
      `frozen benchmark digest mismatch (expected ${frozen.expected}, got ${frozen.actual}) — tests or rubric changed`,
    );
  }
  console.log(`frozen digest OK ${frozen.actual.slice(0, 24)}…`);

  /* --------------------------- first agent ---------------------------- */
  const first = createRunRecord(null);
  saveRun(first);
  console.log(`\n[1/2] running ${first.id}`);
  const run1 = await executeRun(first.id);
  console.log(JSON.stringify(summarize(run1), null, 2));

  if (run1.status !== 'done') {
    throw new Error(`first run did not complete: ${run1.error ?? run1.status}`);
  }

  /* --------------------------- second agent --------------------------- */
  console.log('\n[2/2] second agent reusing published memory');
  const parentCid = run1.publication?.cid ?? null;
  const second = createRunRecord(parentCid);
  saveRun(second);
  const run2 = await executeRun(second.id);
  console.log(JSON.stringify({ ...summarize(run2), parentCid }, null, 2));

  const inherited = await fetchRelevantMemories(config.task.description, {
    extraCids: parentCid ? [parentCid] : [],
  });
  console.log(
    `\nsecond-agent retrieval: ${inherited.hits.length} lesson(s) from ${
      inherited.inheritedCids.length
    } CID(s), query model ${inherited.queryModel}`,
  );

  /* --------------------------- artifacts ------------------------------ */
  mkdirSync(join(ROOT, 'apps/web/public'), { recursive: true });
  const bestSample = (run1.proofs.length ? run1 : run2) as PublicRunRecord;
  writeFileSync(
    join(ROOT, 'apps/web/public/sample_run.json'),
    `${JSON.stringify(bestSample, null, 2)}\n`,
  );
  copyFileSync(
    join(ROOT, 'apps/web/public/sample_run.json'),
    join(ROOT, 'sample_run.json'),
  );

  const totalProvingMs = run1.proofs.reduce((sum, p) => sum + p.provingMs, 0);
  const totalStageMs = run1.stages.at(-1)?.latencyMs ?? 0;
  const summary = {
    at: new Date().toISOString(),
    runs: [summarize(run1), summarize(run2)],
    localRuns: listRuns(10).length,
    totals: {
      provingMs: totalProvingMs,
      wallClockMs: totalStageMs,
      costUsd: run1.usage.costUsd + run2.usage.costUsd,
      proofs: run1.proofs.length + run2.proofs.length,
    },
    inheritedLessons: inherited.hits.map((hit) => ({ cid: hit.cid, lesson: hit.lesson, similarity: hit.similarity })),
    claim:
      'AutoEvolve records each version and its benchmark evidence, proves that the published integer score increased under a fixed rubric, and settles a testnet reward. The proof hides the private metric witness; the public memory omits system prompts. We do NOT claim proof of LLM inference.',
  };
  writeFileSync(join(ROOT, 'demo_summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

  console.log(`\nwrote apps/web/public/sample_run.json (run ${bestSample.id})`);
  console.log(`wrote demo_summary.json`);
  console.log(`cost $${summary.totals.costUsd.toFixed(4)} · proving ${totalProvingMs}ms · wall ${totalStageMs}ms`);
  if (!run1.settlement) {
    console.log('\n(no on-chain settlement: set DEPLOYER_PRIVATE_KEY + REGISTRY_ADDRESS to submit)');
  }

  // The local embedding runtime keeps worker threads alive; exit explicitly so
  // `pnpm demo:clean` terminates instead of waiting on them.
  process.exit(0);
}

main().catch((err) => {
  console.error('\ndemo failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
