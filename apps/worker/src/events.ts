import { appendEvent, type RunEvent } from './db';

type Listener = (event: RunEvent) => void;

const subscribers = new Map<string, Set<Listener>>();

export function subscribe(runId: string, listener: Listener): () => void {
  const set = subscribers.get(runId) ?? new Set<Listener>();
  set.add(listener);
  subscribers.set(runId, set);
  return () => {
    set.delete(listener);
    if (!set.size) subscribers.delete(runId);
  };
}

/** Persist then fan out. Persistence first means a refresh can never lose a stage. */
export function emitEvent(runId: string, type: string, data: unknown): RunEvent {
  const event = appendEvent(runId, type, data);
  for (const listener of subscribers.get(runId) ?? []) {
    try {
      listener(event);
    } catch {
      // A dead SSE client must never break the run.
    }
  }
  return event;
}
