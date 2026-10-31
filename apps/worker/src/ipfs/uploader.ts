import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  SanitizedManifestSchema,
  assertNoSecrets,
  canonicalJson,
  type SanitizedManifest,
} from '@autoevolve/shared';
import { config } from '../config';
import { log } from '../logger';
import { cidForValue } from './cid';

export interface UploadResult {
  cid: string;
  provider: string;
  gatewayUrl: string;
  contentCid: string | null;
  fetchBackVerified: boolean;
}

export interface FetchResult {
  manifest: SanitizedManifest;
  bytes: Buffer;
  source: string;
}

function localPath(cid: string): string {
  return join(config.ipfs.localDir, cid);
}

function ensureLocalDir(): void {
  mkdirSync(config.ipfs.localDir, { recursive: true });
}

/* ------------------------------- providers ------------------------------- */

async function uploadLocal(manifest: SanitizedManifest): Promise<string> {
  ensureLocalDir();
  const { cid, bytes } = cidForValue(manifest);
  writeFileSync(localPath(cid), bytes);
  return cid;
}

async function uploadPinata(manifest: SanitizedManifest): Promise<string> {
  if (!config.ipfs.pinataJwt) throw new Error('pinata: PINATA_JWT not configured');
  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.ipfs.pinataJwt}`,
    },
    body: JSON.stringify({
      pinataContent: manifest,
      pinataMetadata: { name: `autoevolve-${manifest.taskDigest.slice(0, 12)}` },
    }),
  });
  if (!response.ok) {
    throw new Error(`pinata upload failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { IpfsHash?: string };
  if (!body.IpfsHash) throw new Error('pinata upload returned no IpfsHash');
  return body.IpfsHash;
}

/**
 * Storacha (web3.storage successor) upload. The w3up client is an optional
 * dependency: if it is not installed or has no delegation proof, we raise and
 * the caller falls back. This path is code-complete but requires real space
 * credentials, which the repository never contains.
 */
async function uploadStoracha(manifest: SanitizedManifest): Promise<string> {
  if (!config.ipfs.storachaKey || !config.ipfs.storachaProof) {
    throw new Error('storacha: STORACHA_KEY / STORACHA_PROOF not configured');
  }
  const moduleName = '@web3-storage/w3up-client';
  const w3up = (await import(moduleName)) as {
    create: () => Promise<{
      login: (key: string) => Promise<unknown>;
      setCurrentSpace: (space: string) => Promise<void>;
      uploadFile: (file: Blob) => Promise<{ toString: () => string }>;
    }>;
  };
  const client = await w3up.create();
  const principal = await client.login(config.ipfs.storachaKey);
  const proof = JSON.parse(config.ipfs.storachaProof) as { spaces?: Record<string, unknown> };
  const space = Object.keys(proof.spaces ?? {})[0];
  if (!space) throw new Error('storacha: delegation proof contains no space');
  await client.setCurrentSpace(space);
  void principal;
  const blob = new Blob([canonicalJson(manifest)], { type: 'application/json' });
  const cid = await client.uploadFile(blob);
  return cid.toString();
}

/* ------------------------------ fetch-back -------------------------------- */

export async function fetchManifest(cid: string, timeoutMs = 15_000): Promise<FetchResult> {
  if (existsSync(localPath(cid))) {
    const bytes = readFileSync(localPath(cid));
    const manifest = SanitizedManifestSchema.parse(JSON.parse(bytes.toString('utf8')));
    return { manifest, bytes, source: 'local' };
  }

  const urls = [`${config.ipfs.publicBaseUrl}/${cid}`, `${config.ipfs.gateway}/${cid}`];
  let lastError: unknown;
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`${url} -> ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const manifest = SanitizedManifestSchema.parse(JSON.parse(bytes.toString('utf8')));
      return { manifest, bytes, source: url };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `ipfs: could not fetch ${cid}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/* ------------------------------- publishing ------------------------------- */

/**
 * Publish a sanitized manifest and verify it can be fetched back.
 * Order: configured primary (Storacha) -> Pinata -> local content store.
 */
export async function publishManifest(manifest: SanitizedManifest): Promise<UploadResult> {
  assertNoSecrets(manifest);
  const validated = SanitizedManifestSchema.parse(manifest);
  const { cid: localCid } = cidForValue(validated);
  const attempts: Array<{ name: string; fn: (m: SanitizedManifest) => Promise<string> }> = [];

  if (config.ipfs.provider === 'storacha' || config.ipfs.storachaKey) {
    attempts.push({ name: 'storacha', fn: uploadStoracha });
  }
  if (config.ipfs.provider === 'pinata' || config.ipfs.pinataJwt) {
    attempts.push({ name: 'pinata', fn: uploadPinata });
  }
  attempts.push({ name: 'local', fn: uploadLocal });

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const cid = await attempt.fn(validated);
      // Fetch-back validation: same schema, and for local storage the exact bytes.
      const fetched = await fetchManifest(cid);
      const { cid: recomputed } = cidForValue(fetched.manifest);
      const fetchBackVerified = attempt.name === 'local' ? recomputed === cid : Boolean(fetched.manifest);
      log('ipfs_publish', {
        provider: attempt.name,
        cid,
        contentCid: validated.contentCid,
        fetchBackVerified,
        localCid,
      });
      return {
        cid,
        provider: attempt.name,
        gatewayUrl: `${config.ipfs.publicBaseUrl}/${cid}`,
        contentCid: validated.contentCid,
        fetchBackVerified,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${attempt.name}: ${message}`);
      log('ipfs_publish_failed', { provider: attempt.name, error: message });
    }
  }

  throw new Error(`ipfs: every provider failed -> ${errors.join(' | ')}`);
}
