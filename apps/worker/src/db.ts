import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  PublicRunRecordSchema,
  PrivateRunRecordSchema,
  type PrivateRunRecord,
  type PublicRunRecord,
} from '@autoevolve/shared';
import { config } from './config';

export interface RunEvent {
  seq: number;
  runId: string;
  type: string;
  at: string;
  data: unknown;
}

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      public_json TEXT NOT NULL,
      private_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      at TEXT NOT NULL,
      data TEXT NOT NULL,
      UNIQUE (run_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_events_run ON events (run_id, seq);
  `);
  return db;
}

/** Public projection: strips system prompts, raw prompts/responses and LLM logs. */
export function toPublic(record: PrivateRunRecord): PublicRunRecord {
  const {
    systemPrompt: _systemPrompt,
    llmCalls: _llmCalls,
    rawPrompts: _rawPrompts,
    rawResponses: _rawResponses,
    ...rest
  } = record;
  return PublicRunRecordSchema.parse(rest);
}

export function saveRun(record: PrivateRunRecord): void {
  const parsed = PrivateRunRecordSchema.parse(record);
  const publicRecord = toPublic(parsed);
  getDb()
    .prepare(
      `INSERT INTO runs (id, status, created_at, updated_at, public_json, private_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         updated_at = excluded.updated_at,
         public_json = excluded.public_json,
         private_json = excluded.private_json`,
    )
    .run(
      parsed.id,
      parsed.status,
      parsed.createdAt,
      parsed.updatedAt,
      JSON.stringify(publicRecord),
      JSON.stringify(parsed),
    );
}

export function getRun(id: string): PublicRunRecord | null {
  const row = getDb().prepare('SELECT public_json FROM runs WHERE id = ?').get(id) as
    | { public_json: string }
    | undefined;
  return row ? (JSON.parse(row.public_json) as PublicRunRecord) : null;
}

export function getPrivateRun(id: string): PrivateRunRecord | null {
  const row = getDb().prepare('SELECT private_json FROM runs WHERE id = ?').get(id) as
    | { private_json: string }
    | undefined;
  return row ? (JSON.parse(row.private_json) as PrivateRunRecord) : null;
}

export function listRuns(limit = 25): PublicRunRecord[] {
  const rows = getDb()
    .prepare('SELECT public_json FROM runs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<{ public_json: string }>;
  return rows.map((r) => JSON.parse(r.public_json) as PublicRunRecord);
}

export function appendEvent(runId: string, type: string, data: unknown): RunEvent {
  const next = getDb()
    .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM events WHERE run_id = ?')
    .get(runId) as { seq: number };
  const seq = Number(next.seq);
  const event: RunEvent = { seq, runId, type, at: new Date().toISOString(), data };
  getDb()
    .prepare('INSERT INTO events (run_id, seq, type, at, data) VALUES (?, ?, ?, ?, ?)')
    .run(runId, seq, type, event.at, JSON.stringify(data));
  return event;
}

export function listEvents(runId: string, afterSeq = 0): RunEvent[] {
  const rows = getDb()
    .prepare('SELECT seq, run_id, type, at, data FROM events WHERE run_id = ? AND seq > ? ORDER BY seq')
    .all(runId, afterSeq) as Array<{
    seq: number;
    run_id: string;
    type: string;
    at: string;
    data: string;
  }>;
  return rows.map((r) => ({
    seq: Number(r.seq),
    runId: r.run_id,
    type: r.type,
    at: r.at,
    data: JSON.parse(r.data),
  }));
}

export function listPublishedRuns(): PublicRunRecord[] {
  return listRuns(200).filter((r) => r.publication !== null);
}
