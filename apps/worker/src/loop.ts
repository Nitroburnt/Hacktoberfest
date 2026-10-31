import { randomUUID } from 'node:crypto';
import {
  FIELD_MODULUS,
  SanitizedManifestSchema,
  cidCommitment,
  createChangelog,
  sanitizeManifest,
  sha256Hex,
  type Critique,
  type PrivateRunRecord,
  type ProofRecord,
  type PublicRunRecord,
  type ScoreReport,
  type VersionRecord,
} from '@autoevolve/shared';
import { runBenchmark } from '@autoevolve/benchmark';
import {
  buildCircuitInputs,
  proveImprovement,
  transitionIdFor,
  versionCommitment,
} from '@autoevolve/zk';
import { config, isChainConfigured } from './config';
import { settleImprovement } from './chain';
import { CostTracker } from './cost';
import { critiqueCode } from './critic';
import { getPrivateRun, saveRun, toPublic } from './db';
import { embed } from './embeddings';
import { emitEvent } from './events';
import { buildGeneratorPrompt, extractCode } from './generator';
import { contentCidOf } from './ipfs/cid';
import { publishManifest } from './ipfs/uploader';
import { log } from './logger';
import { LlmClient, type LlmResponse } from './llm';
import { fetchRelevantMemories } from './memory';

const nowIso = () => new Date().toISOString();

const STATUS_BY_STAGE: Record<string, PrivateRunRecord['status']> = {
  queued: 'queued',
  memory: 'queued',
  proving: 'proving',
  publishing: 'publishing',
  settling: 'settling',
  done: 'done',
};

function statusForStage(stage: string): PrivateRunRecord['status'] {
  const key = stage.split(' ')[0];
  if (key === 'generating') return 'generating';
  if (key === 'evaluating') return 'evaluating';
  if (key === 'critiquing') return 'critiquing';
  return STATUS_BY_STAGE[key] ?? 'queued';
}

export function createRunRecord(parentCid: string | null): PrivateRunRecord {
  const id = `run-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const at = nowIso();
  return {
    id,
    taskId: config.task.taskId,
    taskDigest: config.taskDigest,
    rubricDigest: config.rubricDigest,
    status: 'queued',
    models: { generator: config.llm.generatorModel, critic: config.llm.criticModel },
    versions: [],
    critiques: [],
    proofs: [],
    publication: null,
    settlement: null,
    memory: parentCid
      ? { inheritedFrom: [parentCid], lessons: [], reusedBadge: true }
      : null,
    usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
    stages: [],
    error: null,
    createdAt: at,
    updatedAt: at,
    systemPrompt: config.systemPrompt,
    llmCalls: [],
    rawPrompts: [],
    rawResponses: [],
  };
}

/** Kick off a run in the background; the HTTP handler returns immediately. */
export function startRun(options: { parentCid?: string | null } = {}): PrivateRunRecord {
  const record = createRunRecord(options.parentCid ?? null);
  saveRun(record);
  emitEvent(record.id, 'stage', {
    stage: 'queued',
    at: record.createdAt,
    latencyMs: 0,
    detail: config.llm.mock ? `mock mode (${config.llm.mockReason})` : 'live Featherless models',
  });
  void executeRun(record.id).catch((err) => {
    log('run_crashed', {
      runId: record.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
  return record;
}

export async function executeRun(runId: string): Promise<PublicRunRecord> {
  const loaded = getPrivateRun(runId);
  if (!loaded) throw new Error(`run ${runId} not found`);
  const record = loaded;
  const started = Date.now();
  const tracker = new CostTracker(config.cost.maxUsd);
  const client = new LlmClient();
  const runner = config.benchmark.runner;

  const save = () => {
    record.updatedAt = nowIso();
    saveRun(record);
  };

  const stage = (stageName: string, detail?: string) => {
    record.status = statusForStage(stageName);
    const entry = {
      stage: stageName,
      at: nowIso(),
      latencyMs: Date.now() - started,
      ...(detail ? { detail } : {}),
    };
    record.stages.push(entry);
    save();
    emitEvent(runId, 'stage', entry);
  };

  const trackCall = (response: LlmResponse, role: 'generator' | 'critic') => {
    tracker.add(response.promptTokens, response.completionTokens, response.costUsd);
    record.usage = {
      promptTokens: tracker.promptTokens,
      completionTokens: tracker.completionTokens,
      costUsd: tracker.costUsd,
    };
    record.llmCalls.push({
      role,
      modelId: response.modelId,
      requestId: response.requestId,
      promptDigest: response.promptDigest,
      responseHash: response.responseHash,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      costUsd: response.costUsd,
      latencyMs: response.latencyMs,
      createdAt: nowIso(),
    });
    emitEvent(runId, 'usage', {
      promptTokens: tracker.promptTokens,
      completionTokens: tracker.completionTokens,
      costUsd: tracker.costUsd,
      modelId: response.modelId,
      role,
    });
  };

  const guardCost = () => {
    if (tracker.exceeded) {
      throw new Error(
        `cost ceiling reached ($${tracker.costUsd.toFixed(4)} >= $${config.cost.maxUsd}); run stopped`,
      );
    }
  };

  const generateVersion = async (
    version: 'V1' | 'V2' | 'V3',
    attempt: number,
    context: { previousCode?: string; critique?: Critique },
    inheritedLessons: string[],
  ): Promise<{ code: string; report: ScoreReport; versionRecord: VersionRecord }> => {
    guardCost();
    stage(`generating ${version}`);
    const prompt = buildGeneratorPrompt({ ...context, inheritedLessons });
    record.rawPrompts.push({ role: `generator:${version}`, content: prompt });

    const response = await client.complete({ role: 'generator', prompt, attempt });
    record.rawResponses.push({ role: `generator:${version}`, content: response.text });
    trackCall(response, 'generator');

    const code = extractCode(response.text);
    stage(`evaluating ${version}`);
    const benchmark = await runBenchmark(code, {
      runner,
      image: config.benchmark.image,
      timeoutMs: config.benchmark.timeoutMs,
    });

    // The changelog is a real diff between versions, never LLM prose.
    let changelog: string | undefined;
    let diffAdded: number | undefined;
    let diffRemoved: number | undefined;
    if (context.previousCode) {
      const diff = createChangelog(context.previousCode, code, `${version} change`);
      changelog = diff.text;
      diffAdded = diff.added;
      diffRemoved = diff.removed;
    }

    const versionRecord: VersionRecord = {
      version,
      code,
      codeHash: sha256Hex(code),
      score: benchmark.report,
      ...(changelog ? { changelog } : {}),
      ...(diffAdded !== undefined ? { diffAdded } : {}),
      ...(diffRemoved !== undefined ? { diffRemoved } : {}),
      ...(inheritedLessons.length ? { inheritedLessons } : {}),
      latencyMs: benchmark.durationMs,
    };
    record.versions = [...record.versions, versionRecord];
    save();
    emitEvent(runId, 'version', {
      version,
      codeHash: versionRecord.codeHash,
      score: benchmark.report,
      diffAdded,
      diffRemoved,
    });
    // Code is public evidence, prompts are not.
    emitEvent(runId, 'code', { version, code });
    return { code, report: benchmark.report, versionRecord };
  };

  const critiqueFor = async (
    code: string,
    report: ScoreReport,
    attempt: number,
    forVersion: 'V1' | 'V2',
  ): Promise<Critique> => {
    guardCost();
    stage(`critiquing ${forVersion}`);
    const result = await critiqueCode(client, code, report, attempt);
    // Private log only: the critic sees failure IDs, never test bodies.
    record.rawPrompts.push({
      role: `critic:${forVersion}`,
      content: `failure ids: ${(report.failureIds ?? []).join(', ') || 'none'}`,
    });
    record.rawResponses.push({ role: `critic:${forVersion}`, content: result.response.text });
    trackCall(result.response, 'critic');
    record.critiques.push({
      forVersion,
      critique: result.critique,
      latencyMs: result.response.latencyMs,
    });
    save();
    emitEvent(runId, 'critique', {
      forVersion,
      critique: result.critique,
      repairs: result.repairs,
    });
    return result.critique;
  };

  try {
    /* ------------------------------ memory -------------------------------- */
    stage('memory', 'retrieving published lessons');
    let inheritedLessons: string[] = record.memory?.lessons ?? [];
    try {
      const memory = await fetchRelevantMemories(config.task.description);
      inheritedLessons = memory.hits.map((hit) => hit.lesson);
      const inheritedFrom = [
        ...new Set([...(record.memory?.inheritedFrom ?? []), ...memory.inheritedCids]),
      ];
      record.memory = {
        inheritedFrom,
        lessons: inheritedLessons,
        reusedBadge: inheritedFrom.length > 0,
      };
      save();
      emitEvent(runId, 'memory', {
        inheritedFrom,
        lessons: inheritedLessons,
        candidates: memory.candidateCids,
        model: memory.queryModel,
      });
    } catch (err) {
      log('memory_unavailable', {
        runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    /* ---------------------------- generation ------------------------------- */
    const v1 = await generateVersion('V1', 1, {}, inheritedLessons);
    if (!v1.report.safety) {
      throw new Error(`V1 failed the safety gate: ${v1.report.safetyReason ?? 'unknown'}`);
    }

    const critique1 = await critiqueFor(v1.code, v1.report, 2, 'V1');
    const v2 = await generateVersion(
      'V2',
      2,
      { previousCode: v1.code, critique: critique1 },
      inheritedLessons,
    );

    const v2Improved = v2.report.safety && v2.report.total > v1.report.total;
    const baseVersion = v2Improved ? v2 : v1;
    const critique2 = await critiqueFor(
      baseVersion.code,
      baseVersion.report,
      3,
      v2Improved ? 'V2' : 'V1',
    );
    await generateVersion(
      'V3',
      3,
      { previousCode: baseVersion.code, critique: critique2 },
      inheritedLessons,
    );

    /* ------------------------------- lessons ------------------------------- */
    const lessons: Array<{ id: string; text: string; embedding: number[] }> = [];
    for (const [index, entry] of record.critiques.entries()) {
      const text = `${entry.critique.defect} — ${entry.critique.suggested_change}`
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;
      const vector = await embed(text);
      lessons.push({ id: `lesson-${index + 1}`, text, embedding: vector.vector });
    }

    /* ---------------------------- manifest core ---------------------------- */
    const core = sanitizeManifest({
      taskDigest: record.taskDigest,
      rubricDigest: record.rubricDigest,
      models: record.models,
      versions: record.versions,
      critiques: record.critiques,
      lessons,
      parentCid: record.memory?.inheritedFrom[0] ?? null,
      createdAt: record.createdAt,
    });
    const contentCid = contentCidOf(core);
    const commitment = cidCommitment(contentCid);

    /* -------------------------------- proofs ------------------------------- */
    const proofs: ProofRecord[] = [];
    stage('proving', `${record.versions.length} evaluated version(s)`);
    const rubricField = BigInt(`0x${config.benchmarkDigest}`) % FIELD_MODULUS;

    for (let i = 1; i < record.versions.length; i++) {
      const oldVersion = record.versions[i - 1];
      const newVersion = record.versions[i];
      if (!oldVersion.score || !newVersion.score) continue;
      if (!oldVersion.score.safety || !newVersion.score.safety) continue;
      if (newVersion.score.total <= oldVersion.score.total) {
        emitEvent(runId, 'proof_skipped', {
          fromVersion: oldVersion.version,
          toVersion: newVersion.version,
          reason: `${oldVersion.score.total} -> ${newVersion.score.total} is not an improvement`,
        });
        continue;
      }

      const inputs = buildCircuitInputs(oldVersion.score, newVersion.score, {
        rubricDigest: rubricField,
        versionCommitOld: versionCommitment(oldVersion.code),
        versionCommitNew: versionCommitment(newVersion.code),
        transitionNonce: 1,
        manifestCommit: commitment,
      });
      const bundle = await proveImprovement(inputs);
      const proof: ProofRecord = {
        transitionId: transitionIdFor(runId, oldVersion.score.total, newVersion.score.total),
        fromVersion: oldVersion.version,
        toVersion: newVersion.version,
        oldScore: oldVersion.score.total,
        newScore: newVersion.score.total,
        circuit: 'packages/zk/circuits/improvement.circom',
        publicSignals: bundle.publicSignals,
        proof: bundle.proof,
        localVerified: bundle.localVerified,
        onChainVerified: false,
        provingMs: bundle.provingMs,
      };
      proofs.push(proof);
      record.proofs = [...proofs];
      save();
      emitEvent(runId, 'proof', {
        transitionId: proof.transitionId,
        fromVersion: proof.fromVersion,
        toVersion: proof.toVersion,
        oldScore: proof.oldScore,
        newScore: proof.newScore,
        provingMs: proof.provingMs,
        localVerified: proof.localVerified,
      });
    }

    if (!proofs.length) {
      log('no_proof', { runId, reason: 'no strict improvement between adjacent versions' });
    }

    /* ------------------------------ publish -------------------------------- */
    const primary = proofs[proofs.length - 1] ?? null;
    const manifest = SanitizedManifestSchema.parse({
      ...core,
      contentCid,
      proofPublicInputs: primary
        ? {
            oldScore: primary.oldScore,
            newScore: primary.newScore,
            rubricDigest: primary.publicSignals[2],
            versionCommitOld: primary.publicSignals[3],
            versionCommitNew: primary.publicSignals[4],
            transitionNonce: primary.publicSignals[5],
            manifestCommitment: primary.publicSignals[6],
          }
        : null,
    });

    stage('publishing', `manifest for ${record.versions.length} version(s)`);
    const upload = await publishManifest(manifest);
    record.publication = {
      cid: upload.cid,
      gatewayUrl: upload.gatewayUrl,
      manifestCommitment: commitment.toString(),
      provider: upload.provider,
    };
    save();
    emitEvent(runId, 'publication', record.publication);

    /* ----------------------------- settlement ------------------------------ */
    if (primary && isChainConfigured()) {
      stage('settling', `registry submit ${primary.transitionId}`);
      try {
        const settlement = await settleImprovement(toPublic(record), primary, upload.cid);
        if (settlement) {
          record.proofs = record.proofs.map((proof) =>
            proof.transitionId === primary.transitionId
              ? { ...proof, onChainVerified: settlement.onChainVerified }
              : proof,
          );
          record.settlement = {
            chainId: settlement.chainId,
            txHash: settlement.txHash,
            explorerUrl: settlement.explorerUrl,
            rewardWei: settlement.rewardWei,
            contractAddress: settlement.contractAddress,
          };
          save();
          emitEvent(runId, 'settlement', {
            ...record.settlement,
            onChainVerified: settlement.onChainVerified,
            blockNumber: settlement.blockNumber,
          });
        }
      } catch (err) {
        // A settlement failure must not hide the proof/manifest already built.
        const message = err instanceof Error ? err.message : String(err);
        log('settlement_failed', { runId, error: message });
        emitEvent(runId, 'settlement_failed', { error: message });
      }
    } else if (primary) {
      emitEvent(runId, 'settlement_skipped', {
        reason: 'chain not configured (set DEPLOYER_PRIVATE_KEY + REGISTRY_ADDRESS)',
      });
    }

    stage('done');
    emitEvent(runId, 'done', {
      total: record.versions[record.versions.length - 1]?.score?.total ?? 0,
      proofs: record.proofs.length,
      cid: record.publication?.cid ?? null,
      txHash: record.settlement?.txHash ?? null,
      mock: config.llm.mock,
    });
    return toPublic(record);
  } catch (err) {
    record.status = 'failed';
    record.error = err instanceof Error ? err.message : String(err);
    record.updatedAt = nowIso();
    saveRun(record);
    emitEvent(runId, 'error', { error: record.error });
    log('run_failed', { runId, error: record.error });
    return toPublic(record);
  }
}
