import type { RegistryResponse, RunRecord, WsConfig } from './types';

export const WORKER_ORIGIN =
  process.env.NEXT_PUBLIC_WORKER_ORIGIN?.replace(/\/$/, '') || 'http://localhost:8787';

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${WORKER_ORIGIN}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${path} -> ${response.status}`);
  return (await response.json()) as T;
}

export const api = {
  config: () => getJson<WsConfig>('/api/config'),
  runs: () => getJson<{ runs: RunRecord[] }>('/api/runs'),
  run: (id: string) => getJson<RunRecord>(`/api/runs/${id}`),
  startRun: (parentCid?: string) =>
    getJson<{ id: string }>('/api/runs', {
      method: 'POST',
      body: JSON.stringify({ parentCid: parentCid ?? null }),
    }),
  registry: () => getJson<RegistryResponse>('/api/registry'),
  ipfs: (cid: string) => getJson<Record<string, unknown>>(`/api/ipfs/${cid}`),
  memory: (description: string) =>
    getJson<{
      queryModel: string;
      candidateCids: number;
      hits: Array<{ cid: string; lesson: string; similarity: number }>;
    }>(`/api/memory?description=${encodeURIComponent(description)}`),
};

export function gatewayUrl(cid: string): string {
  return `${WORKER_ORIGIN}/api/ipfs/${cid}`;
}

export function shorten(value: string | null | undefined, head = 10, tail = 6): string {
  if (!value) return '—';
  return value.length <= head + tail ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function formatWei(wei: string): string {
  try {
    const value = BigInt(wei);
    const whole = value / 10n ** 18n;
    const frac = (value % 10n ** 18n).toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
    return `${whole}${frac ? `.${frac}` : ''} ETH`;
  } catch {
    return wei;
  }
}
