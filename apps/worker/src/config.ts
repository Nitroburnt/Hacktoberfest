import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');

function env(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

function readFrozen(name: string): string {
  const path = join(ROOT, 'packages/shared/src/frozen', name);
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : '';
}

interface FrozenTask {
  taskId: string;
  title: string;
  description: string;
  requirements: string[];
  bannedImports: string[];
  timeoutSec: number;
}

const taskSpec = JSON.parse(
  readFileSync(join(ROOT, 'packages/shared/src/frozen/frozen_task_spec.json'), 'utf8'),
) as FrozenTask;

const apiKey = env('FEATHERLESS_API_KEY');
const mockForced = env('MOCK_LLM') === '1';

export const config = {
  root: ROOT,
  port: Number(env('WORKER_PORT', '8787')),
  workerOrigin: env('WORKER_ORIGIN', 'http://localhost:8787'),
  webOrigin: env('WEB_ORIGIN', 'http://localhost:3000'),
  dbPath: resolve(ROOT, env('RUNS_DB_PATH', 'apps/worker/data/autoevolve.sqlite')),
  dataDir: resolve(ROOT, '.data'),

  task: taskSpec,
  taskDigest: readFrozen('task_digest.txt'),
  rubricDigest: readFrozen('rubric_digest.txt'),
  benchmarkDigest: readFrozen('benchmark_digest.txt'),
  rubric: JSON.parse(readFileSync(join(ROOT, 'packages/shared/src/frozen/rubric.json'), 'utf8')) as {
    version: string;
    formula: string;
    maxScore: number;
    safetyGate: { bannedImports: string[]; timeoutSec: number };
  },

  llm: {
    apiKey,
    baseUrl: env('FEATHERLESS_BASE_URL', 'https://api.featherless.ai/v1'),
    generatorModel: env('GENERATOR_MODEL', 'Qwen/Qwen2.5-Coder-32B-Instruct'),
    criticModel: env('CRITIC_MODEL', 'deepseek-ai/DeepSeek-R1'),
    fallbackModel: env('FALLBACK_MODEL', 'Qwen/Qwen3-32B'),
    maxOutputTokens: 3000,
    /** Deterministic offline mode when no key is present or MOCK_LLM=1. */
    mock: mockForced || !apiKey,
    mockReason: mockForced ? 'MOCK_LLM=1' : apiKey ? '' : 'FEATHERLESS_API_KEY not set',
  },

  cost: {
    maxUsd: Number(env('MAX_COST_USD', '10')),
  },

  benchmark: {
    runner: (env('BENCHMARK_RUNNER', 'local') as 'docker' | 'local'),
    image: env('BENCHMARK_IMAGE', 'autoevolve-bench'),
    timeoutMs: Number(env('BENCHMARK_TIMEOUT_SEC', '5')) * 1000 + 25_000,
  },

  ipfs: {
    provider: (env('IPFS_PROVIDER', 'local') as 'local' | 'storacha' | 'pinata'),
    gateway: env('IPFS_GATEWAY', 'https://w3s.link/ipfs'),
    storachaKey: env('STORACHA_KEY'),
    storachaProof: env('STORACHA_PROOF'),
    pinataJwt: env('PINATA_JWT'),
    localDir: resolve(ROOT, '.data/ipfs'),
    publicBaseUrl: `${env('WORKER_ORIGIN', 'http://localhost:8787')}/api/ipfs`,
  },

  chain: {
    rpcUrl: env('BASE_SEPOLIA_RPC_URL', 'https://sepolia.base.org'),
    privateKey: env('DEPLOYER_PRIVATE_KEY'),
    registryAddress: env('REGISTRY_ADDRESS'),
    verifierAddress: env('VERIFIER_ADDRESS'),
    rewardWei: BigInt(env('REWARD_WEI', '100000000000000')),
    explorer: env('NEXT_PUBLIC_BASESCAN_URL', 'https://sepolia.basescan.org'),
    chainId: 84532,
  },

  systemPrompt:
    'You are the generator agent of AutoEvolve. You write a single Python file. ' +
    'You never see hidden test bodies. Return only code.',
};

export type WorkerConfig = typeof config;

export function isChainConfigured(): boolean {
  return Boolean(config.chain.privateKey && config.chain.registryAddress);
}
