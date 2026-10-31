import { createHash } from 'node:crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function digestOf(value: unknown): string {
  return sha256(typeof value === 'string' ? value : JSON.stringify(value));
}

/** Structured, secret-free log line. Prompts and keys are never logged in full. */
export function log(event: string, fields: Record<string, unknown> = {}): void {
  const line = { t: new Date().toISOString(), event, ...fields };
  console.log(JSON.stringify(line));
}

export function logLlmCall(fields: {
  role: string;
  modelId: string;
  requestId: string | null;
  promptDigest: string;
  responseHash: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  mock: boolean;
}): void {
  log('llm_call', fields);
}
