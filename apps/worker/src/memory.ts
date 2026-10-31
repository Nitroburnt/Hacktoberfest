import type { SanitizedManifest } from '@autoevolve/shared';
import { fetchRegistryEvents } from './chain';
import { config } from './config';
import { listPublishedRuns } from './db';
import { embed, cosine } from './embeddings';
import { fetchManifest } from './ipfs/uploader';
import { log } from './logger';

export interface MemoryHit {
  cid: string;
  lesson: string;
  similarity: number;
  taskDigest: string;
  createdAt: string;
}

export interface RelevantMemories {
  queryModel: string;
  candidateCids: number;
  manifestsRead: number;
  hits: MemoryHit[];
  inheritedCids: string[];
}

async function gatherCids(extraCids: string[]): Promise<string[]> {
  const cids = new Set<string>(extraCids.filter(Boolean));

  // 1. On-chain registry events (authoritative shared memory).
  try {
    for (const event of await fetchRegistryEvents(50)) {
      if (event.cid) cids.add(event.cid);
    }
  } catch {
    // Chain may be unreachable; local publications still work.
  }

  // 2. Local publications (demo / offline mode).
  for (const run of listPublishedRuns()) {
    if (run.publication?.cid) cids.add(run.publication.cid);
  }
  return [...cids];
}

/**
 * Phase 5.4 second agent.
 *
 * Queries the registry (or local store), fetches manifests from IPFS, embeds
 * the new task description locally and ranks stored failure lessons by cosine
 * similarity. Returns the top lessons plus the CIDs they came from, so the
 * generator can cite inherited memory.
 */
export async function fetchRelevantMemories(
  description: string,
  options: { limit?: number; extraCids?: string[]; minSimilarity?: number } = {},
): Promise<RelevantMemories> {
  const limit = options.limit ?? 3;
  const minSimilarity = options.minSimilarity ?? 0.05;
  const cids = await gatherCids(options.extraCids ?? []);
  const query = await embed(`${config.task.title}. ${description}`);

  const hits: MemoryHit[] = [];
  let manifestsRead = 0;

  for (const cid of cids) {
    let manifest: SanitizedManifest;
    try {
      const fetched = await fetchManifest(cid);
      manifest = fetched.manifest;
      manifestsRead += 1;
    } catch (err) {
      log('memory_fetch_failed', { cid, error: err instanceof Error ? err.message : String(err) });
      continue;
    }

    for (const lesson of manifest.lessons) {
      if (!lesson.text) continue;
      const vector = lesson.embedding.length ? lesson.embedding : (await embed(lesson.text)).vector;
      const similarity = cosine(query.vector, vector);
      if (similarity < minSimilarity) continue;
      hits.push({
        cid,
        lesson: lesson.text,
        similarity: Math.round(similarity * 1000) / 1000,
        taskDigest: manifest.taskDigest,
        createdAt: manifest.createdAt,
      });
    }
  }

  hits.sort((a, b) => b.similarity - a.similarity);
  const top = hits.slice(0, limit);

  return {
    queryModel: query.model,
    candidateCids: cids.length,
    manifestsRead,
    hits: top,
    inheritedCids: [...new Set(top.map((h) => h.cid))],
  };
}
