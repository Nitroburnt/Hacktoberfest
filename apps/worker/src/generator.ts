import type { Critique } from '@autoevolve/shared';
import { config } from './config';

export interface GeneratorContext {
  previousCode?: string;
  critique?: Critique;
  inheritedLessons?: string[];
}

/**
 * Generator prompt. Deliberately contains only:
 *   task spec + previous code + the sanitized critique + inherited lessons.
 * It NEVER contains hidden test bodies — only failure IDs come back from the
 * benchmark, and those reach the generator through the critic.
 */
export function buildGeneratorPrompt(context: GeneratorContext): string {
  const { task, rubric } = config;
  const sections: string[] = [
    'You are an expert Python engineer. Write a single Python file that satisfies the frozen task.',
    `TASK: ${task.title}\n${task.description}`,
    `REQUIREMENTS:\n${task.requirements.map((r) => `- ${r}`).join('\n')}`,
    `SCORING: total = functional*8 + edge*3 + static. Max ${rubric.maxScore}. ` +
      `Banned imports: ${rubric.safetyGate.bannedImports.join(', ')}. ` +
      `Execution timeout: ${rubric.safetyGate.timeoutSec}s, no network.`,
  ];

  if (context.inheritedLessons?.length) {
    sections.push(
      `LESSONS FROM PREVIOUS RUNS (memory reuse, cite them if applied):\n${context.inheritedLessons
        .map((l, i) => `${i + 1}. ${l}`)
        .join('\n')}`,
    );
  }

  if (context.previousCode) {
    sections.push(`PREVIOUS VERSION:\n\`\`\`python\n${context.previousCode}\n\`\`\``);
  }

  if (context.critique) {
    sections.push(
      `REVIEWER FEEDBACK (fix each point):\n` +
        `- defect: ${context.critique.defect}\n` +
        `- evidence: ${context.critique.evidence}\n` +
        `- severity: ${context.critique.severity}\n` +
        `- suggested change: ${context.critique.suggested_change}`,
    );
  }

  sections.push(
    'Return ONLY the complete Python file inside a single ```python fenced block. ' +
      'No prose, no tests, no explanations.',
  );

  return sections.join('\n\n');
}

/** Extract the code body from a fenced block, tolerating a bare file response. */
export function extractCode(response: string): string {
  const fenced = [...response.matchAll(/```(?:python|py)?\s*\n([\s\S]*?)```/gi)];
  if (fenced.length) {
    // Use the longest block: models sometimes emit a short example first.
    const best = fenced
      .map((m) => m[1])
      .sort((a, b) => b.length - a.length)[0];
    return `${best.trim()}\n`;
  }
  const trimmed = response.trim();
  if (!trimmed) throw new Error('generator returned an empty response');
  return `${trimmed}\n`;
}
