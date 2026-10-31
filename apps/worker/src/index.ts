import Fastify from 'fastify';
import cors from '@fastify/cors';
import { existsSync, readFileSync } from 'node:fs';
import { config, isChainConfigured } from './config';
import { getRun, listEvents, listRuns } from './db';
import { subscribe } from './events';
import { startRun } from './loop';
import { fetchRegistryEvents } from './chain';
import { fetchRelevantMemories } from './memory';
import { fetchManifest } from './ipfs/uploader';
import { log } from './logger';
import { join } from 'node:path';

const app = Fastify({ logger: false });

await app.register(cors, {
  origin: [config.webOrigin, 'http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'OPTIONS'],
});

app.get('/health', async () => ({
  ok: true,
  mockLlm: config.llm.mock,
  mockReason: config.llm.mockReason,
  chainConfigured: isChainConfigured(),
  ipfsProvider: config.ipfs.provider,
  benchmarkRunner: config.benchmark.runner,
}));

app.get('/api/config', async () => ({
  models: {
    generator: config.llm.generatorModel,
    critic: config.llm.criticModel,
    fallback: config.llm.fallbackModel,
  },
  task: config.task,
  rubricDigest: config.rubricDigest,
  benchmarkDigest: config.benchmarkDigest,
  taskDigest: config.taskDigest,
  mockLlm: config.llm.mock,
  mockReason: config.llm.mockReason,
  chainConfigured: isChainConfigured(),
  chainId: config.chain.chainId,
  registryAddress: config.chain.registryAddress || null,
  explorer: config.chain.explorer,
  ipfsProvider: config.ipfs.provider,
  benchmarkRunner: config.benchmark.runner,
  maxCostUsd: config.cost.maxUsd,
}));

app.post('/api/runs', async (request, reply) => {
  const body = (request.body ?? {}) as { parentCid?: string };
  const record = startRun({ parentCid: body.parentCid ?? null });
  reply.code(202);
  return { id: record.id, status: record.status, mockLlm: config.llm.mock };
});

app.get('/api/runs', async () => ({ runs: listRuns(50) }));

app.get('/api/runs/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const run = getRun(id);
  if (!run) {
    reply.code(404);
    return { error: 'run not found' };
  }
  return run;
});

app.get('/api/runs/:id/stream', async (request, reply) => {
  const { id } = request.params as { id: string };
  if (!getRun(id)) {
    reply.code(404);
    return { error: 'run not found' };
  }
  const after = Number((request.query as { after?: string }).after ?? 0);

  reply.hijack();
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
    'access-control-allow-origin': config.webOrigin,
  });

  const send = (event: unknown) => {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Replay persisted events first so a refresh reconstructs the run.
  for (const event of listEvents(id, after)) send(event);

  const unsubscribe = subscribe(id, send);
  const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 15_000);

  request.raw.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

app.get('/api/registry', async () => {
  const [onChain, local] = await Promise.all([
    fetchRegistryEvents(50),
    Promise.resolve(
      listRuns(200)
        .filter((run) => run.publication)
        .map((run) => ({
          runId: run.id,
          cid: run.publication!.cid,
          gatewayUrl: run.publication!.gatewayUrl,
          manifestCommitment: run.publication!.manifestCommitment,
          provider: run.publication!.provider,
          rubricDigest: run.rubricDigest,
          scores: run.versions.map((v) => ({ version: v.version, total: v.score?.total ?? null })),
          proofs: run.proofs.length,
          settlement: run.settlement,
          createdAt: run.createdAt,
        })),
    ),
  ]);
  return { onChain, local, chainConfigured: isChainConfigured(), chainId: config.chain.chainId };
});

app.get('/api/memory', async (request) => {
  const query = (request.query as { description?: string }).description ?? config.task.description;
  const memories = await fetchRelevantMemories(query);
  return memories;
});

app.get('/api/ipfs/:cid', async (request, reply) => {
  const { cid } = request.params as { cid: string };
  try {
    // Prefer the local content store (works offline), then gateways.
    const localFile = join(config.ipfs.localDir, cid);
    if (existsSync(localFile)) {
      reply.header('content-type', 'application/json');
      return JSON.parse(readFileSync(localFile, 'utf8'));
    }
    const { manifest } = await fetchManifest(cid);
    return manifest;
  } catch (err) {
    reply.code(404);
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

app.setErrorHandler((error, _request, reply) => {
  const message = error instanceof Error ? error.message : String(error);
  log('http_error', { message });
  reply.code(500).send({ error: message });
});

const close = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);

await app.listen({ port: config.port, host: '127.0.0.1' });
log('worker_listening', {
  port: config.port,
  mock: config.llm.mock,
  reason: config.llm.mockReason,
  benchmarkRunner: config.benchmark.runner,
  chainConfigured: isChainConfigured(),
});
