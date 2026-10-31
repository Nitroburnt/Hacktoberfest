import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import type { RunRecord } from '@/lib/types';
import { RunView } from '@/components/RunView';

export const dynamic = 'force-dynamic';

function sampleRun(): RunRecord {
  const raw = readFileSync(join(process.cwd(), 'public/sample_run.json'), 'utf8');
  return JSON.parse(raw) as RunRecord;
}

export default async function RunPage({ params }: { params: { id: string } }) {
  if (params.id === 'sample') {
    return <RunView initialRun={sampleRun()} sample />;
  }

  try {
    const run = await api.run(params.id);
    return <RunView initialRun={run} />;
  } catch {
    // Worker unreachable: fall back to the recorded sample for offline demos.
    const fallback = sampleRun();
    if (params.id !== fallback.id) {
      // Still show something useful rather than a blank 404.
      notFound();
    }
    return <RunView initialRun={fallback} sample />;
  }
}
