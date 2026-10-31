'use client';

import { useState } from 'react';

export function CopyButton({ value, label = 'copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className="rounded border border-edge px-2 py-0.5 text-[11px] text-slate-400 hover:border-accent/50 hover:text-accent"
    >
      {copied ? 'copied' : label}
    </button>
  );
}
