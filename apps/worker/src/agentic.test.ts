import { describe, expect, it } from 'vitest';
import { calculateScore } from '@autoevolve/shared';
import { costGuardTestOnly, CostTracker, computeCostUsd } from './cost';
import { buildCriticPrompt, critiqueCode } from './critic';
import { config } from './config';
import { buildGeneratorPrompt } from './generator';
import type { LlmClient, LlmResponse } from './llm';

const score = calculateScore({
  functional: 6,
  edge: 2,
  static: 2,
  safety: true,
  failureIds: ['test_f03_duplicate_id_is_dropped', 'test_e04_whitespace_is_normalized'],
});

const sampleCode = `import csv\ndef parse_transactions(path):\n    return []\n`;

function fakeResponse(text: string): LlmResponse {
  return {
    text,
    modelId: config.llm.criticModel,
    requestId: 'fake-1',
    promptDigest: 'p',
    responseHash: 'r',
    promptTokens: 10,
    completionTokens: 5,
    costUsd: 0,
    latencyMs: 1,
    mock: true,
  };
}

function fakeClient(texts: string[]): { client: LlmClient; calls: () => number } {
  let index = 0;
  const stub = {
    usingMock: true,
    generatorModel: config.llm.generatorModel,
    criticModel: config.llm.criticModel,
    complete: async () => fakeResponse(texts[Math.min(index++, texts.length - 1)]),
  };
  return { client: stub as unknown as LlmClient, calls: () => index };
}

describe('Phase 2 - adversarial separation and privacy', () => {
  it('T2.1 generator and critic are different pinned models', () => {
    expect(config.llm.generatorModel).not.toBe(config.llm.criticModel);
    expect(config.llm.generatorModel).toContain('Qwen');
    expect(config.llm.criticModel.length).toBeGreaterThan(0);
  });

  it('T2.2 critic prompt has failure IDs but no hidden test bodies', () => {
    const prompt = buildCriticPrompt(sampleCode, score);
    expect(prompt).toContain('test_f03_duplicate_id_is_dropped');
    // Test bodies / fixtures from the frozen suite must never appear.
    expect(prompt).not.toContain('make_csv');
    expect(prompt).not.toContain('assert len(rows)');
    expect(prompt).not.toContain('parse_transactions(str(path))');
    expect(prompt).not.toContain('FROZEN');
  });

  it('T2.3 malformed critic JSON gets exactly one repair, then fails gracefully', async () => {
    const repaired = fakeClient([
      'not json at all',
      JSON.stringify({
        defect: 'd',
        evidence: 'e',
        severity: 'med',
        suggested_change: 's',
        confidence: 0.7,
      }),
    ]);
    const result = await critiqueCode(repaired.client, sampleCode, score, 2);
    expect(result.repairs).toBe(1);
    expect(repaired.calls()).toBe(2);

    const broken = fakeClient(['nope', 'still nope']);
    await expect(critiqueCode(broken.client, sampleCode, score, 2)).rejects.toThrow();
    expect(broken.calls()).toBe(2);
  });

  it('T2.5 cost tracker sums and reports the ceiling', () => {
    const tracker = new CostTracker(1);
    const cost = computeCostUsd('Qwen/Qwen2.5-Coder-32B-Instruct', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(1.6, 5);
    tracker.add(1_000_000, 1_000_000, cost);
    expect(tracker.costUsd).toBeCloseTo(1.6, 5);
    expect(tracker.exceeded).toBe(true);
    expect(costGuardTestOnly(tracker)).toBe(true);
  });

  it('T2.4 generator prompt carries task, previous code and critique only', () => {
    const prompt = buildGeneratorPrompt({
      previousCode: sampleCode,
      critique: {
        defect: 'no dedup',
        evidence: 'test_f03',
        severity: 'high',
        suggested_change: 'dedupe by id',
        confidence: 0.9,
      },
      inheritedLessons: ['strip whitespace before validation'],
    });
    expect(prompt).toContain('no dedup');
    expect(prompt).toContain('dedupe by id');
    expect(prompt).toContain('strip whitespace');
    expect(prompt).toContain(sampleCode.trim().slice(0, 12));
    expect(prompt).not.toContain('make_csv');
  });
});
