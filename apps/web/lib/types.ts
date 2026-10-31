export type VersionId = 'V1' | 'V2' | 'V3';

export interface ScoreReport {
  functional: number;
  edge: number;
  static: number;
  safety: boolean;
  total: number;
  safetyReason?: string;
  failureIds?: string[];
}

export interface VersionRecord {
  version: VersionId;
  code: string;
  codeHash: string;
  score: ScoreReport | null;
  changelog?: string;
  diffAdded?: number;
  diffRemoved?: number;
  inheritedLessons?: string[];
  latencyMs?: number;
}

export interface Critique {
  defect: string;
  evidence: string;
  severity: 'low' | 'med' | 'high';
  suggested_change: string;
  confidence: number;
}

export interface ProofRecord {
  transitionId: string;
  fromVersion: VersionId;
  toVersion: VersionId;
  oldScore: number;
  newScore: number;
  circuit: string;
  publicSignals: string[];
  proof: unknown;
  localVerified: boolean;
  onChainVerified: boolean;
  provingMs: number;
}

export interface StageRecord {
  stage: string;
  at: string;
  latencyMs: number;
  detail?: string;
}

export interface RunRecord {
  id: string;
  taskId: string;
  taskDigest: string;
  rubricDigest: string;
  status: string;
  models: { generator: string; critic: string };
  versions: VersionRecord[];
  critiques: Array<{ forVersion: VersionId; critique: Critique; latencyMs?: number }>;
  proofs: ProofRecord[];
  publication: {
    cid: string;
    gatewayUrl: string;
    manifestCommitment: string;
    provider: string;
  } | null;
  settlement: {
    chainId: number;
    txHash: string;
    explorerUrl: string;
    rewardWei: string;
    contractAddress: string;
  } | null;
  memory: { inheritedFrom: string[]; lessons: string[]; reusedBadge: boolean } | null;
  usage: { promptTokens: number; completionTokens: number; costUsd: number };
  stages: StageRecord[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WsConfig {
  models: { generator: string; critic: string; fallback: string };
  task: { taskId: string; title: string; description: string };
  rubricDigest: string;
  benchmarkDigest: string;
  taskDigest: string;
  mockLlm: boolean;
  mockReason: string;
  chainConfigured: boolean;
  chainId: number;
  registryAddress: string | null;
  explorer: string;
  ipfsProvider: string;
  benchmarkRunner: string;
  maxCostUsd: number;
}

export interface RegistryResponse {
  onChain: Array<{
    agent: string;
    transitionId: string;
    oldScore: number;
    newScore: number;
    cid: string;
    rewardWei: string;
    txHash: string;
    blockNumber: number;
  }>;
  local: Array<{
    runId: string;
    cid: string;
    gatewayUrl: string;
    manifestCommitment: string;
    provider: string;
    rubricDigest: string;
    scores: Array<{ version: VersionId; total: number | null }>;
    proofs: number;
    settlement: RunRecord['settlement'];
    createdAt: string;
  }>;
  chainConfigured: boolean;
  chainId: number;
}

export interface StreamEvent {
  seq: number;
  runId: string;
  type: string;
  at: string;
  data: Record<string, unknown>;
}
