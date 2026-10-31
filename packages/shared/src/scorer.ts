/**
 * The ONE scoring implementation. Nothing else in the repo may compute a total.
 *
 *   total = functional * 8 + edge * 3 + static
 *   max   = 10 * 8 + 5 * 3 + 5 = 100
 *
 * Safety gate: a code sample that trips the sandbox (banned import, timeout,
 * network attempt) scores 0 regardless of how many tests it passed.
 */

export const RUBRIC_VERSION = '1.0.0';
export const WEIGHTS = { functional: 8, edge: 3, static: 1 } as const;
export const LIMITS = { functional: 10, edge: 5, static: 5 } as const;
export const MAX_SCORE = 100;

export interface ScoreInput {
  functional: number;
  edge: number;
  static: number;
  safety: boolean;
  safetyReason?: string;
  failureIds?: string[];
}

export interface ScoreReport {
  functional: number;
  edge: number;
  static: number;
  safety: boolean;
  total: number;
  safetyReason?: string;
  failureIds?: string[];
}

function assertCount(name: keyof typeof LIMITS, value: number): void {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`scorer: ${name} must be an integer (got ${String(value)})`);
  }
  if (value < 0 || value > LIMITS[name]) {
    throw new Error(`scorer: ${name} must be within 0..${LIMITS[name]} (got ${value})`);
  }
}

/**
 * Compute the frozen rubric score. Pure, integer-only, no randomness, no I/O.
 */
export function calculateScore(input: ScoreInput): ScoreReport {
  assertCount('functional', input.functional);
  assertCount('edge', input.edge);
  assertCount('static', input.static);
  if (typeof input.safety !== 'boolean') {
    throw new Error('scorer: safety must be a boolean');
  }

  const total = input.safety
    ? input.functional * WEIGHTS.functional + input.edge * WEIGHTS.edge + input.static * WEIGHTS.static
    : 0;

  return {
    functional: input.functional,
    edge: input.edge,
    static: input.static,
    safety: input.safety,
    total,
    ...(input.safetyReason ? { safetyReason: input.safetyReason } : {}),
    ...(input.failureIds ? { failureIds: [...input.failureIds].sort() } : {}),
  };
}

/** Human-readable breakdown, used by the dashboard metrics panel. */
export function explainScore(report: ScoreReport): string {
  if (!report.safety) {
    return `safety gate FAILED (${report.safetyReason ?? 'policy violation'}) -> 0`;
  }
  return (
    `${report.functional}*8 + ${report.edge}*3 + ${report.static} ` +
    `= ${report.functional * WEIGHTS.functional} + ${report.edge * WEIGHTS.edge} + ${report.static} = ${report.total}`
  );
}
