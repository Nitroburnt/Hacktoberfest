/// <reference path="./diff.d.ts" />
import { structuredPatch } from 'diff';

export interface ChangelogEntry {
  label: string;
  text: string;
  added: number;
  removed: number;
  changedLines: number;
}

/**
 * Changelog from a real unified diff (the `diff` package), never from an LLM.
 * Lines that changed count as one added + one removed, so `changedLines` is
 * the number of code lines the reviewer actually has to look at.
 */
export function createChangelog(oldCode: string, newCode: string, label = 'version'): ChangelogEntry {
  const patch = structuredPatch(label, label, oldCode, newCode, '', '', { context: 3 });

  let added = 0;
  let removed = 0;
  const hunks: string[] = [];

  for (const hunk of patch.hunks) {
    const lines = hunk.lines.filter((l) => !l.startsWith('\\'));
    const hunkAdded = lines.filter((l) => l.startsWith('+')).length;
    const hunkRemoved = lines.filter((l) => l.startsWith('-')).length;
    added += hunkAdded;
    removed += hunkRemoved;
    hunks.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n${lines.join('\n')}`);
  }

  const changedLines = Math.min(added, removed);
  const header =
    added === 0 && removed === 0
      ? `${label}: no changes`
      : `${label}: +${added} / -${removed} (${changedLines} changed line${changedLines === 1 ? '' : 's'})`;

  return {
    label,
    text: hunks.length ? `${header}\n\n${hunks.join('\n')}` : header,
    added,
    removed,
    changedLines,
  };
}

/** Short one-line summary used in the execution tree edge labels. */
export function summarizeChangelog(entry: ChangelogEntry): string {
  if (entry.added === 0 && entry.removed === 0) return 'no code change';
  return `+${entry.added}/-${entry.removed} lines`;
}
