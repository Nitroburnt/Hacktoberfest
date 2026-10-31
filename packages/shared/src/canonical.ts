/**
 * Canonical JSON: deterministic serialization used for every hash, CID input
 * and proof commitment in AutoEvolve.
 *
 * Rules (frozen by rubric version 1.0.0):
 *  - object keys sorted lexicographically (UTF-16 code unit order)
 *  - no insignificant whitespace
 *  - arrays keep their order
 *  - bigint serialized as a decimal string
 *  - undefined object properties are dropped
 */
export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | bigint
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function encode(value: CanonicalValue): string {
  if (value === null) return 'null';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonicalJson: non-finite number');
    return JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`;
  const keys = Object.keys(value).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const child = value[key];
    if (child === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${encode(child as CanonicalValue)}`);
  }
  return `{${parts.join(',')}}`;
}

/** Deterministic stringify — key order never changes the output. */
export function canonicalJson(value: unknown): string {
  return encode(value as CanonicalValue);
}

/** Canonical form of any value, parsed back (same key order as the string). */
export function canonicalize<T = unknown>(value: unknown): T {
  return JSON.parse(canonicalJson(value)) as T;
}
