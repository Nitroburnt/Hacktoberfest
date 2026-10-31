import { z } from 'zod';

/* ------------------------------------------------------------------ scoring */

export const ScoreReportSchema = z.object({
  functional: z.number().int().min(0).max(10),
  edge: z.number().int().min(0).max(5),
  static: z.number().int().min(0).max(5),
  safety: z.boolean(),
  total: z.number().int().min(0).max(100),
  safetyReason: z.string().optional(),
  failureIds: z.array(z.string()).optional(),
});
export type ScoreReportData = z.infer<typeof ScoreReportSchema>;

/* ----------------------------------------------------------------- critique */

export const CritiqueSchema = z.object({
  defect: z.string().min(1),
  evidence: z.string().min(1),
  severity: z.enum(['low', 'med', 'high']),
  suggested_change: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type Critique = z.infer<typeof CritiqueSchema>;

/* -------------------------------------------------------------- run records */

export const VersionRecordSchema = z.object({
  version: z.enum(['V1', 'V2', 'V3']),
  code: z.string(),
  codeHash: z.string(),
  score: ScoreReportSchema.nullable(),
  changelog: z.string().optional(),
  diffAdded: z.number().int().nonnegative().optional(),
  diffRemoved: z.number().int().nonnegative().optional(),
  inheritedLessons: z.array(z.string()).optional(),
  latencyMs: z.number().nonnegative().optional(),
});
export type VersionRecord = z.infer<typeof VersionRecordSchema>;

export const RunStatusSchema = z.enum([
  'queued',
  'generating',
  'evaluating',
  'critiquing',
  'proving',
  'publishing',
  'settling',
  'done',
  'failed',
]);

export const ProofRecordSchema = z.object({
  transitionId: z.string(),
  fromVersion: z.enum(['V1', 'V2', 'V3']),
  toVersion: z.enum(['V1', 'V2', 'V3']),
  oldScore: z.number().int().min(0).max(100),
  newScore: z.number().int().min(0).max(100),
  circuit: z.string(),
  publicSignals: z.array(z.string()),
  proof: z.unknown(),
  localVerified: z.boolean(),
  onChainVerified: z.boolean(),
  provingMs: z.number().nonnegative(),
});
export type ProofRecord = z.infer<typeof ProofRecordSchema>;

export const PublicRunRecordSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  taskDigest: z.string(),
  rubricDigest: z.string(),
  status: RunStatusSchema,
  models: z.object({ generator: z.string(), critic: z.string() }),
  versions: z.array(VersionRecordSchema),
  critiques: z.array(
    z.object({
      forVersion: z.enum(['V1', 'V2', 'V3']),
      critique: CritiqueSchema,
      latencyMs: z.number().nonnegative().optional(),
    }),
  ),
  proofs: z.array(ProofRecordSchema),
  publication: z
    .object({
      cid: z.string(),
      gatewayUrl: z.string(),
      manifestCommitment: z.string(),
      provider: z.string(),
    })
    .nullable(),
  settlement: z
    .object({
      chainId: z.number().int(),
      txHash: z.string(),
      explorerUrl: z.string(),
      rewardWei: z.string(),
      contractAddress: z.string(),
    })
    .nullable(),
  memory: z
    .object({
      inheritedFrom: z.array(z.string()),
      lessons: z.array(z.string()),
      reusedBadge: z.boolean(),
    })
    .nullable(),
  usage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
  }),
  stages: z.array(
    z.object({
      stage: z.string(),
      at: z.string(),
      latencyMs: z.number().nonnegative(),
      detail: z.string().optional(),
    }),
  ),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicRunRecord = z.infer<typeof PublicRunRecordSchema>;

/**
 * Private record. Lives only in the worker SQLite DB and is never serialized
 * into the public manifest or the SSE stream.
 */
export const PrivateRunRecordSchema = PublicRunRecordSchema.extend({
  systemPrompt: z.string(),
  llmCalls: z.array(
    z.object({
      role: z.enum(['generator', 'critic']),
      modelId: z.string(),
      requestId: z.string().nullable(),
      promptDigest: z.string(),
      responseHash: z.string(),
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      costUsd: z.number().nonnegative(),
      latencyMs: z.number().nonnegative(),
      createdAt: z.string(),
    }),
  ),
  rawPrompts: z.array(z.object({ role: z.string(), content: z.string() })),
  rawResponses: z.array(z.object({ role: z.string(), content: z.string() })),
});
export type PrivateRunRecord = z.infer<typeof PrivateRunRecordSchema>;

/* -------------------------------------------------------------- sanitized */

export const SanitizedManifestSchema = z.object({
  schemaVersion: z.literal(1),
  taskDigest: z.string(),
  rubricDigest: z.string(),
  models: z.object({ generator: z.string(), critic: z.string() }),
  versions: z.array(
    z.object({
      version: z.enum(['V1', 'V2', 'V3']),
      codeHash: z.string(),
      score: z.number().int().min(0).max(100).nullable(),
      functional: z.number().int().min(0).max(10).nullable(),
      edge: z.number().int().min(0).max(5).nullable(),
      staticScore: z.number().int().min(0).max(5).nullable(),
      safety: z.boolean(),
      changelog: z.string().optional(),
    }),
  ),
  critiques: z.array(
    z.object({
      forVersion: z.enum(['V1', 'V2', 'V3']),
      defect: z.string(),
      evidence: z.string(),
      severity: z.enum(['low', 'med', 'high']),
      suggestedChange: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  lessons: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      embedding: z.array(z.number()),
      sourceCid: z.string().optional(),
    }),
  ),
  /**
   * CID of this manifest with `contentCid` and `proofPublicInputs` set to null.
   * The circuit's manifestCommitment is keccak256(contentCid), which avoids a
   * hash circularity (the proof is part of the published document).
   */
  contentCid: z.string().nullable(),
  proofPublicInputs: z
    .object({
      oldScore: z.number().int(),
      newScore: z.number().int(),
      rubricDigest: z.string(),
      versionCommitOld: z.string(),
      versionCommitNew: z.string(),
      transitionNonce: z.string(),
      manifestCommitment: z.string(),
    })
    .nullable(),
  parentCid: z.string().nullable(),
  createdAt: z.string(),
});
export type SanitizedManifest = z.infer<typeof SanitizedManifestSchema>;
