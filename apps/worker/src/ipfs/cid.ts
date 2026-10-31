import { createHash } from 'node:crypto';
import { canonicalJson } from '@autoevolve/shared';

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base32Lower(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/**
 * CIDv1 with the dag-json codec (0x0129) and sha2-256 multihash, rendered as
 * multibase base32 (`b...`). This is the same CID a real IPFS node would derive
 * for the same canonical JSON bytes.
 */
export function computeCidV1(bytes: Uint8Array): string {
  const digest = createHash('sha256').update(bytes).digest();
  const multihash = Buffer.concat([Buffer.from([0x12, 0x20]), digest]);
  const cidBytes = Buffer.concat([Buffer.from([0x01]), Buffer.from([0xa9, 0x02]), multihash]);
  return `b${base32Lower(cidBytes)}`;
}

export function cidForValue(value: unknown): { cid: string; bytes: Buffer; canonical: string } {
  const canonical = canonicalJson(value);
  const bytes = Buffer.from(canonical, 'utf8');
  return { cid: computeCidV1(bytes), bytes, canonical };
}

/**
 * The committed part of a manifest: the document with the two fields that
 * depend on the commitment itself removed. Deterministic and recomputable by
 * any judge from the published manifest.
 */
export function contentCidOf(value: unknown): string {
  const clone = JSON.parse(canonicalJson(value)) as Record<string, unknown>;
  clone.contentCid = null;
  clone.proofPublicInputs = null;
  return cidForValue(clone).cid;
}
