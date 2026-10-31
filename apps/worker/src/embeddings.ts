import { createHash } from 'node:crypto';
import { config } from './config';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const FALLBACK_DIMS = 384;

type Extractor = (text: string, options: Record<string, unknown>) => Promise<{
  data: Float32Array | number[];
}>;

let extractorPromise: Promise<Extractor | null> | null = null;

async function loadExtractor(): Promise<Extractor | null> {
  try {
    process.env.TRANSFORMERS_CACHE ??= `${config.dataDir}/models`;
    process.env.HF_HOME ??= `${config.dataDir}/models`;
    const transformers = (await import('@xenova/transformers')) as unknown as {
      pipeline: (task: string, model: string) => Promise<Extractor>;
    };
    return await transformers.pipeline('feature-extraction', MODEL_ID);
  } catch {
    // Offline / model download failure: the deterministic fallback still gives
    // usable cosine ranking for memory search.
    return null;
  }
}

function getExtractor(): Promise<Extractor | null> {
  extractorPromise ??= loadExtractor();
  return extractorPromise;
}

/** Deterministic hashed bag-of-words embedding (L2 normalized). */
export function fallbackEmbedding(text: string): number[] {
  const vector = new Array<number>(FALLBACK_DIMS).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const token of tokens) {
    const digest = createHash('sha256').update(token).digest();
    const index = digest.readUInt16BE(0) % FALLBACK_DIMS;
    const sign = digest[2] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => Math.round((v / norm) * 1e6) / 1e6);
}

export interface EmbeddingResult {
  vector: number[];
  model: string;
}

export async function embed(text: string): Promise<EmbeddingResult> {
  const extractor = await getExtractor();
  if (!extractor) return { vector: fallbackEmbedding(text), model: 'hashed-bow-384' };
  try {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data).map((v) => Math.round(v * 1e6) / 1e6);
    return { vector, model: MODEL_ID };
  } catch {
    return { vector: fallbackEmbedding(text), model: 'hashed-bow-384' };
  }
}

export function cosine(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
