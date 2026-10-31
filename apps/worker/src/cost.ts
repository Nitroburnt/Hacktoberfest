/**
 * Cost guard: every LLM call adds its computed USD cost to the run total.
 * The orchestrator checks `wouldExceed` before starting a new call, so a run
 * can never blow past MAX_COST_USD even if a model misbehaves.
 */
export interface Pricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

/**
 * Featherless bills a flat subscription, so these are conservative list-price
 * equivalents used for budgeting, not invoices. Override per model with
 * env in the future if needed.
 */
export const DEFAULT_PRICING: Record<string, Pricing> = {
  'Qwen/Qwen2.5-Coder-32B-Instruct': { inputPerMillionUsd: 0.8, outputPerMillionUsd: 0.8 },
  'deepseek-ai/DeepSeek-R1': { inputPerMillionUsd: 2.5, outputPerMillionUsd: 2.5 },
  'Qwen/Qwen3-32B': { inputPerMillionUsd: 0.8, outputPerMillionUsd: 0.8 },
};

export function priceFor(model: string): Pricing {
  return DEFAULT_PRICING[model] ?? { inputPerMillionUsd: 1, outputPerMillionUsd: 1 };
}

export function computeCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const price = priceFor(model);
  const cost =
    (promptTokens / 1_000_000) * price.inputPerMillionUsd +
    (completionTokens / 1_000_000) * price.outputPerMillionUsd;
  return Math.round(cost * 1e6) / 1e6;
}

export class CostTracker {
  promptTokens = 0;
  completionTokens = 0;
  costUsd = 0;

  constructor(readonly ceilingUsd: number) {}

  add(promptTokens: number, completionTokens: number, costUsd: number): void {
    this.promptTokens += promptTokens;
    this.completionTokens += completionTokens;
    this.costUsd = Math.round((this.costUsd + costUsd) * 1e6) / 1e6;
  }

  get exceeded(): boolean {
    return this.costUsd >= this.ceilingUsd;
  }

  get summary() {
    return {
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      costUsd: this.costUsd,
      ceilingUsd: this.ceilingUsd,
    };
  }
}

/** Test hook: the same check the orchestrator applies before each call. */
export function costGuardTestOnly(tracker: CostTracker): boolean {
  return tracker.exceeded;
}
