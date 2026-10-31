import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';
import { computeCostUsd } from './cost';
import { config } from './config';
import { logLlmCall, sha256 } from './logger';

export interface LlmRequest {
  role: 'generator' | 'critic';
  prompt: string;
  /** 1-based attempt number, used by the deterministic mock. */
  attempt: number;
  maxOutputTokens?: number;
}

export interface LlmResponse {
  text: string;
  modelId: string;
  requestId: string | null;
  promptDigest: string;
  responseHash: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  mock: boolean;
}

const MOCK_FIXTURES = [
  'V1_buggy.py',
  'V2_fixed.py',
  'V3_improved.py',
] as const;

function mockGeneratorCode(attempt: number): string {
  const file = MOCK_FIXTURES[Math.min(attempt, MOCK_FIXTURES.length) - 1];
  return readFileSync(
    join(config.root, 'AutoEvolve_Test_Suite/AutoEvolve_Test_Suite/benchmark_fixtures', file),
    'utf8',
  );
}

function mockCritique(prompt: string): string {
  const ids = Array.from(prompt.matchAll(/\b(test_[a-z0-9_]+)\b/g)).map((m) => m[1]);
  const unique = [...new Set(ids)].slice(0, 3);
  return JSON.stringify({
    defect: unique.length
      ? `failing behaviours: ${unique.join(', ')}`
      : 'no functional evidence supplied; check input validation',
    evidence: unique.length ? `failure ids: ${unique.join(', ')}` : 'no failure ids in context',
    severity: unique.length > 2 ? 'high' : unique.length ? 'med' : 'low',
    suggested_change:
      'strip whitespace, validate dates with datetime.strptime, deduplicate by transaction_id and skip malformed rows with warnings.warn',
    confidence: 0.9,
  });
}

export class LlmClient {
  private client: OpenAI | null;

  constructor(private readonly cfg = config.llm) {
    this.client = cfg.mock
      ? null
      : new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl, timeout: 120_000, maxRetries: 1 });
  }

  get usingMock(): boolean {
    return this.cfg.mock;
  }

  get generatorModel(): string {
    return this.cfg.generatorModel;
  }

  get criticModel(): string {
    return this.cfg.criticModel;
  }

  private async callOpenAI(model: string, prompt: string, maxTokens: number): Promise<LlmResponse> {
    if (!this.client) throw new Error('llm: client not configured');
    const started = Date.now();
    const completion = await this.client.chat.completions.create({
      model,
      temperature: 0.0,
      top_p: 1.0,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const latencyMs = Date.now() - started;
    const msg = completion.choices[0]?.message as unknown as {
      content?: string | null;
      reasoning?: string | null;
      reasoning_content?: string | null;
    };
    const text =
      msg?.content && msg.content.trim().length > 0
        ? msg.content
        : msg?.reasoning || msg?.reasoning_content || '';
    const promptTokens = completion.usage?.prompt_tokens ?? 0;
    const completionTokens = completion.usage?.completion_tokens ?? 0;
    const requestId =
      (completion as unknown as { _request_id?: string })._request_id ??
      (completion as unknown as { id?: string }).id ??
      null;

    return {
      text,
      modelId: completion.model || model,
      requestId,
      promptDigest: sha256(prompt),
      responseHash: sha256(text),
      promptTokens,
      completionTokens,
      costUsd: computeCostUsd(model, promptTokens, completionTokens),
      latencyMs,
      mock: false,
    };
  }

  private mockResponse(request: LlmRequest, model: string): LlmResponse {
    const started = Date.now();
    const text =
      request.role === 'generator' ? mockGeneratorCode(request.attempt) : mockCritique(request.prompt);
    // Deterministic synthetic usage so the cost panel has believable numbers.
    const promptTokens = Math.ceil(request.prompt.length / 4);
    const completionTokens = Math.ceil(text.length / 4);
    const response: LlmResponse = {
      text,
      modelId: model,
      requestId: `mock-${sha256(`${request.prompt}:${request.attempt}`).slice(0, 16)}`,
      promptDigest: sha256(request.prompt),
      responseHash: sha256(text),
      promptTokens,
      completionTokens,
      costUsd: 0,
      latencyMs: Date.now() - started,
      mock: true,
    };
    return response;
  }

  /**
   * One completion. The generator and critic always use different pinned model
   * IDs; temperature is 0 and top_p is 1 for reproducibility.
   */
  async complete(request: LlmRequest): Promise<LlmResponse> {
    const model =
      request.role === 'generator' ? this.cfg.generatorModel : this.cfg.criticModel;
    const maxTokens = request.maxOutputTokens ?? this.cfg.maxOutputTokens;

    const response = this.cfg.mock
      ? this.mockResponse(request, model)
      : await this.callOpenAI(model, request.prompt, maxTokens);

    logLlmCall({
      role: request.role,
      modelId: response.modelId,
      requestId: response.requestId,
      promptDigest: response.promptDigest,
      responseHash: response.responseHash,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      costUsd: response.costUsd,
      latencyMs: response.latencyMs,
      mock: response.mock,
    });

    return response;
  }
}
