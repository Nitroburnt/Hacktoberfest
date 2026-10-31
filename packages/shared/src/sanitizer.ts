import { cidCommitmentString } from './cid';
import { SanitizedManifestSchema, type SanitizedManifest } from './schemas';

/**
 * Fields that may ever leave the worker. Everything else is dropped — the
 * sanitizer builds its output from this allowlist and never spreads the input,
 * so a new private field can never leak by accident.
 */
export const PUBLIC_FIELDS = [
  'schemaVersion',
  'taskDigest',
  'rubricDigest',
  'models',
  'versions',
  'critiques',
  'lessons',
  'contentCid',
  'proofPublicInputs',
  'parentCid',
  'createdAt',
] as const;

/** Substrings that must never appear in a published manifest. */
export const FORBIDDEN_SUBSTRINGS = [
  'systemPrompt',
  'system_prompt',
  'sk-',
  'apiKey',
  'api_key',
  'rawResponse',
  'rawPrompt',
  'privateTest',
  'password',
  'secret',
] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function int(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function sanitizeVersion(version: any) {
  const score = version?.score ?? {};
  const v = version?.version === 'V2' || version?.version === 'V3' ? version.version : 'V1';
  return {
    version: v as 'V1' | 'V2' | 'V3',
    codeHash: str(version?.codeHash),
    score: version?.score ? int(score.total) : null,
    functional: version?.score ? int(score.functional) : null,
    edge: version?.score ? int(score.edge) : null,
    staticScore: version?.score ? int(score.static) : null,
    safety: Boolean(version?.score?.safety),
    ...(typeof version?.changelog === 'string' ? { changelog: version.changelog } : {}),
  };
}

/**
 * Convert a private RunRecord into the public, sanitized manifest.
 * Drops system prompts, raw prompts/responses, API keys and private tests.
 */
export function sanitizeManifest(privateRecord: any): SanitizedManifest {
  const record = privateRecord ?? {};
  const now = new Date().toISOString();

  const rawVersions: any[] = Array.isArray(record.versions) ? record.versions : [];
  const rawCritiques: any[] = Array.isArray(record.critiques) ? record.critiques : [];
  const rawLessons: any[] = Array.isArray(record.lessons) ? record.lessons : [];

  // The primary proof is the last successful transition in the run.
  const proofs: any[] = Array.isArray(record.proofs) ? record.proofs : [];
  const proof = record.proof ?? proofs[proofs.length - 1] ?? null;
  // Public signals order is fixed by the circuit:
  // [oldScore, newScore, rubricDigest, versionCommitOld, versionCommitNew, transitionNonce, manifestCommit]
  const signals: string[] = Array.isArray(proof?.publicSignals) ? proof.publicSignals : [];
  const signal = (i: number, fallback: unknown = '0') => String(signals[i] ?? fallback);
  const proofPublicInputs = proof
    ? {
        oldScore: int(proof.oldScore ?? signals[0]),
        newScore: int(proof.newScore ?? signals[1]),
        rubricDigest: signal(2, proof.rubricDigest),
        versionCommitOld: signal(3, proof.versionCommitOld),
        versionCommitNew: signal(4, proof.versionCommitNew),
        transitionNonce: signal(5, proof.transitionNonce),
        manifestCommitment: signal(6, proof.manifestCommitment),
      }
    : null;

  const manifest: SanitizedManifest = {
    schemaVersion: 1,
    taskDigest: str(record.taskDigest),
    rubricDigest: str(record.rubricDigest),
    models: {
      generator: str(record?.models?.generator, 'unknown'),
      critic: str(record?.models?.critic, 'unknown'),
    },
    versions: rawVersions.map((v) => {
      const cleaned = sanitizeVersion(v);
      // Never publish raw prompts or code bodies: only hashes, scores, diffs.
      return cleaned;
    }),
    critiques: rawCritiques.map((entry) => {
      const c = entry?.critique ?? entry;
      return {
        forVersion: c?.forVersion === 'V2' || c?.forVersion === 'V3' ? c.forVersion : 'V1',
        defect: str(c?.defect ?? c?.defectSummary),
        evidence: str(c?.evidence),
        severity: c?.severity === 'high' || c?.severity === 'med' ? c.severity : 'low',
        suggestedChange: str(c?.suggested_change ?? c?.suggestedChange),
        confidence: typeof c?.confidence === 'number' ? c.confidence : 0,
      } as SanitizedManifest['critiques'][number];
    }),
    lessons: rawLessons.map((lesson, i) => ({
      id: str(lesson?.id, `lesson-${i + 1}`),
      text: str(lesson?.text),
      embedding: Array.isArray(lesson?.embedding)
        ? lesson.embedding.filter((n: unknown): n is number => typeof n === 'number')
        : [],
      ...(typeof lesson?.sourceCid === 'string' ? { sourceCid: lesson.sourceCid } : {}),
    })),
    contentCid: typeof record.contentCid === 'string' ? record.contentCid : null,
    proofPublicInputs,
    parentCid: typeof record.parentCid === 'string' ? record.parentCid : null,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
  };

  return SanitizedManifestSchema.parse(manifest);
}

/** Belt-and-braces check run right before upload. */
export function assertNoSecrets(manifest: unknown): void {
  const text = JSON.stringify(manifest);
  for (const needle of FORBIDDEN_SUBSTRINGS) {
    if (text.includes(needle)) {
      throw new Error(`sanitizer: published manifest still contains forbidden marker "${needle}"`);
    }
  }
}

/** Convenience: manifest commitment that the worker hands to the contract. */
export function manifestCommitmentForCid(cid: string): string {
  return cidCommitmentString(cid);
}
