import { keccak256, stringToHex } from 'viem';

/** BN254 scalar field modulus — every circuit input must be reduced mod p. */
export const FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** keccak256(cidString) as a hex string (0x-prefixed). */
export function cidCommitmentHex(cid: string): `0x${string}` {
  return keccak256(stringToHex(cid));
}

/**
 * Circuit/contract commitment for a CID: keccak256 of the UTF-8 CID string,
 * reduced into the BN254 field so it can be a public signal.
 */
export function cidCommitment(cid: string): bigint {
  return BigInt(cidCommitmentHex(cid)) % FIELD_MODULUS;
}

export function cidCommitmentString(cid: string): string {
  return cidCommitment(cid).toString();
}
