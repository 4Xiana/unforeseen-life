import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DATA_DIR } from './data-path.js';
import type { QuestThread } from './quest-thread-types.js';
export const threadInput = z.object({
  title: z.string().trim().min(1, '给这条支线起个名字吧').max(60),
  description: z.string().trim().max(240).default(''),
  questIds: z.array(z.string().min(1).max(200)).min(1, '至少选一段经历').max(500),
}).strict();

/** Only the grouping is stored here. Original records are never copied or removed. */
export class QuestThreadStore {
  private db: Database.Database;
  constructor(filename = path.join(DATA_DIR, 'quest-threads.sqlite')) {
    mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec('CREATE TABLE IF NOT EXISTS quest_threads (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS threads_owner ON quest_threads(client_id)');
  }
  close() { this.db.close(); }
  list(clientId: string): QuestThread[] {
    return (this.db.prepare('SELECT data FROM quest_threads WHERE client_id=? ORDER BY rowid DESC').all(clientId) as { data: string }[]).map(row => JSON.parse(row.data));
  }
  get(clientId: string, id: string): QuestThread {
    const row = this.db.prepare('SELECT data FROM quest_threads WHERE id=? AND client_id=?').get(id, clientId) as { data: string } | undefined;
    if (!row) throw new Error('找不到这条支线，请刷新后重试');
    return JSON.parse(row.data);
  }
  save(clientId: string, input: unknown, allowedQuestIds: Set<string>, id?: string): QuestThread {
    const value = threadInput.parse(input);
    const questIds = [...new Set(value.questIds)];
    if (questIds.some(key => !allowedQuestIds.has(key))) throw new Error('所选经历已变化，请刷新后重新选择');
    return this.db.transaction(() => {
      const previous = id ? this.get(clientId, id) : null;
      const now = new Date().toISOString();
      const thread: QuestThread = { ...value, questIds, id: previous?.id || randomUUID(), createdAt: previous?.createdAt || now, updatedAt: now };
      if (previous) this.db.prepare('UPDATE quest_threads SET data=? WHERE id=? AND client_id=?').run(JSON.stringify(thread), thread.id, clientId);
      else this.db.prepare('INSERT INTO quest_threads(id,client_id,data) VALUES (?,?,?)').run(thread.id, clientId, JSON.stringify(thread));
      return thread;
    })();
  }
  remove(clientId: string, id: string) {
    this.get(clientId, id);
    this.db.prepare('DELETE FROM quest_threads WHERE id=? AND client_id=?').run(id, clientId);
  }
}
let store: QuestThreadStore | undefined;
export const getQuestThreadStore = () => store ??= new QuestThreadStore();
