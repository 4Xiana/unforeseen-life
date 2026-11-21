import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { WorkingMemorySnapshot } from './agent/memory/types.js';
import { DATA_DIR } from './data-path.js';

export interface SavedEvent {
  id: number;
  at: number;
  event: Record<string, unknown>;
}

export interface SavedSession {
  sessionId: string;
  clientId: string;
  snapshot: WorkingMemorySnapshot;
  status: 'idle' | 'processing' | 'interrupted';
  events: SavedEvent[];
}

/** 状态快照与可见事件在同一个事务中落盘。原始输入单独留存，不截断。 */
export class SessionStore {
  private db: Database.Database;

  constructor(filename = path.join(DATA_DIR, 'sessions.sqlite')) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, client_id TEXT NOT NULL, snapshot TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle', updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_client ON sessions(client_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES sessions(id),
        at INTEGER NOT NULL, payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_session ON events(session_id, id);
      CREATE TABLE IF NOT EXISTS requests (
        session_id TEXT NOT NULL REFERENCES sessions(id), request_id TEXT NOT NULL,
        input TEXT NOT NULL, status TEXT NOT NULL,
        PRIMARY KEY(session_id, request_id)
      );
    `);
    // 单进程部署：上次进程退出时没完成的回合不自动重跑，防止重复验收/结算。
    this.db.prepare("UPDATE sessions SET status = 'interrupted' WHERE status = 'processing'").run();
  }

  create(id: string, clientId: string, snapshot: WorkingMemorySnapshot) {
    this.db.prepare('INSERT INTO sessions(id, client_id, snapshot, updated_at) VALUES (?, ?, ?, ?)')
      .run(id, clientId, JSON.stringify(snapshot), Date.now());
  }

  get(id: string, clientId: string): SavedSession | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ? AND client_id = ?').get(id, clientId) as
      { id: string; client_id: string; snapshot: string; status: SavedSession['status'] } | undefined;
    if (!row) return null;
    const events = this.db.prepare('SELECT id, at, payload FROM events WHERE session_id = ? ORDER BY id')
      .all(id) as { id: number; at: number; payload: string }[];
    return {
      sessionId: row.id, clientId: row.client_id, snapshot: JSON.parse(row.snapshot),
      status: row.status, events: events.map(e => ({ id: e.id, at: e.at, event: JSON.parse(e.payload) })),
    };
  }

  latest(clientId: string): SavedSession | null {
    const row = this.db.prepare('SELECT id FROM sessions WHERE client_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1')
      .get(clientId) as { id: string } | undefined;
    return row ? this.get(row.id, clientId) : null;
  }

  begin(id: string, requestId: string, input: Record<string, unknown>, userEvent: Record<string, unknown>, snapshot: WorkingMemorySnapshot) {
    return this.db.transaction(() => {
      const duplicate = this.db.prepare('SELECT status FROM requests WHERE session_id = ? AND request_id = ?')
        .get(id, requestId);
      if (duplicate) return 'duplicate' as const;
      const row = this.db.prepare('SELECT status FROM sessions WHERE id = ?').get(id) as { status: string } | undefined;
      if (!row || row.status === 'processing') return 'busy' as const;
      this.db.prepare('INSERT INTO requests VALUES (?, ?, ?, ?)').run(id, requestId, JSON.stringify(input), 'processing');
      this.db.prepare("UPDATE sessions SET status = 'processing', updated_at = ? WHERE id = ?").run(Date.now(), id);
      this.append(id, snapshot, userEvent);
      return 'started' as const;
    })();
  }

  append(id: string, snapshot: WorkingMemorySnapshot, event?: Record<string, unknown>) {
    this.db.transaction(() => {
      this.db.prepare('UPDATE sessions SET snapshot = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(snapshot), Date.now(), id);
      if (event) this.db.prepare('INSERT INTO events(session_id, at, payload) VALUES (?, ?, ?)')
        .run(id, Date.now(), JSON.stringify(event));
    })();
  }

  finish(id: string, requestId: string, snapshot: WorkingMemorySnapshot, failed = false) {
    this.db.transaction(() => {
      this.append(id, snapshot);
      this.db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(failed ? 'interrupted' : 'idle', id);
      this.db.prepare('UPDATE requests SET status = ? WHERE session_id = ? AND request_id = ?')
        .run(failed ? 'interrupted' : 'done', id, requestId);
    })();
  }

  close() { this.db.close(); }
}
