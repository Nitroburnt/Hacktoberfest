import { CritiqueSchema, type Critique, type ScoreReport } from '@autoevolve/shared';
import { config } from './config';
import type { LlmClient, LlmResponse } from './llm';

export interface CriticResult {
  critique: Critique;
  response: LlmResponse;
  repairs: number;
}

/**
 * Critic prompt: rubric summary + failure IDs + the candidate code.
 * Failure IDs are opaque test names; stack traces are never forwarded, and
 * hidden test bodies are never included (privacy check T2.2).
 */
export function buildCriticPrompt(code: string, score: ScoreReport): string {
  const { rubric } = config;
  const ids = score.failureIds ?? [];
  return [
    'You are a principal Python reviewer. Diagnose the failing behaviours of the candidate.',
    `RUBRIC: ${rubric.formula}. Max ${rubric.maxScore}. ` +
      `Safety gate bans ${rubric.safetyGate.bannedImports.join(', ')}.`,
    `SCORE BREAKDOWN: functional ${score.functional}/10, edge ${score.edge}/5, static ${score.static}/5, total ${score.total}.`,
    `FAILURE IDS (opaque test identifiers, no test bodies are provided):\n${
      ids.length ? ids.map((id) => `- ${id}`).join('\n') : '- none'
    }`,
    `CANDIDATE CODE:\n\`\`\`python\n${code}\n\`\`\``,
    'Respond with STRICT JSON only, matching exactly:\n' +
      '{"defect": string, "evidence": string, "severity": "low"|"med"|"high", ' +
      '"suggested_change": string, "confidence": number between 0 and 1}',
  ].join('\n\n');
}

function parseCritique(text: string): Critique {
  // First try extracting a markdown json fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      return CritiqueSchema.parse(parsed);
    } catch {
      // Continue to bracket search
    }
  }

  // DeepSeek-R1 outputs reasoning followed by the final answer at the end.
  // Search from right-to-left for a valid JSON object matching CritiqueSchema.
  const cleaned = text.trim();
  let end = cleaned.lastIndexOf('}');
  while (end !== -1) {
    let start = cleaned.lastIndexOf('{', end);
    while (start !== -1) {
      try {
        const candidate = cleaned.slice(start, end + 1);
        const parsed = JSON.parse(candidate);
        return CritiqueSchema.parse(parsed);
      } catch {
        // try previous opening brace
      }
      start = cleaned.lastIndexOf('{', start - 1);
    }
    end = cleaned.lastIndexOf('}', end - 1);
  }

  throw new Error('critic: no JSON object in response');
}

export async function critiqueCode(
  client: LlmClient,
  code: string,
  score: ScoreReport,
  attempt: number,
): Promise<CriticResult> {
  const prompt = buildCriticPrompt(code, score);
  const first = await client.complete({ role: 'critic', prompt, attempt });

  try {
    return { critique: parseCritique(first.text), response: first, repairs: 0 };
  } catch (firstError) {
    // Exactly one repair call, then fail gracefully.
    const repairPrompt = `${prompt}\n\nYour previous answer was invalid: ${
      firstError instanceof Error ? firstError.message : String(firstError)
    }\nReturn ONLY the JSON object, no markdown, no prose.`;
    const second = await client.complete({ role: 'critic', prompt: repairPrompt, attempt });
    try {
      return { critique: parseCritique(second.text), response: second, repairs: 1 };
    } catch (secondError) {
      throw new Error(
        `critic returned invalid JSON twice: ${
          secondError instanceof Error ? secondError.message : String(secondError)
        }`,
      );
    }
  }
}
