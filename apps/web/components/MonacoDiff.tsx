'use client';

import { DiffEditor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Bundle Monaco locally (no CDN) so the dashboard works during an offline demo.
// Next/webpack understands `new Worker(new URL(..., import.meta.url))` and emits
// the editor worker as a separate chunk.
if (typeof window !== 'undefined') {
  (self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
    getWorker: () =>
      new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url)),
  };
  loader.config({ monaco });
}

export function MonacoDiff({ original, modified }: { original: string; modified: string }) {
  return (
    <div className="h-[420px] overflow-hidden rounded-lg border border-edge/70">
      <DiffEditor
        original={original}
        modified={modified}
        language="python"
        theme="vs-dark"
        options={{
          readOnly: true,
          renderSideBySide: true,
          minimap: { enabled: false },
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          scrollBeyondLastLine: false,
          renderOverviewRuler: false,
          automaticLayout: true,
        }}
      />
    </div>
  );
}
