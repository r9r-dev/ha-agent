import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

const DB_PATH = process.env.DB_PATH ?? 'data/ha-agent.db';

export class HADatabase {
  private db: Database;

  constructor(path = DB_PATH) {
    mkdirSync(path.split('/').slice(0, -1).join('/') || '.', { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA foreign_keys=ON');
    this.migrate();
    console.log(`[DB] SQLite ouvert: ${path}`);
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        role    TEXT    NOT NULL,
        content TEXT    NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS preferences (
        chat_id    INTEGER NOT NULL,
        key        TEXT    NOT NULL,
        value      TEXT    NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (chat_id, key)
      );

      CREATE TABLE IF NOT EXISTS alerts (
        chat_id   INTEGER NOT NULL,
        entity_id TEXT    NOT NULL,
        enabled   INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (chat_id, entity_id)
      );
    `);
  }

  // --- Historique ---

  getHistory(chatId: number, limit = 10): MessageParam[] {
    const rows = this.db
      .prepare(
        `SELECT role, content FROM messages
         WHERE chat_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`
      )
      .all(chatId, limit) as { role: string; content: string }[];

    return rows.reverse().map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: JSON.parse(r.content),
    }));
  }

  appendMessages(chatId: number, messages: MessageParam[]): void {
    const stmt = this.db.prepare(
      'INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)'
    );
    this.db.transaction(() => {
      for (const msg of messages) {
        stmt.run(chatId, msg.role, JSON.stringify(msg.content));
      }
    })();
  }

  clearHistory(chatId: number): void {
    this.db.prepare('DELETE FROM messages WHERE chat_id = ?').run(chatId);
  }

  // --- Préférences ---

  getPreferences(chatId: number): Record<string, string> {
    const rows = this.db
      .prepare('SELECT key, value FROM preferences WHERE chat_id = ?')
      .all(chatId) as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  setPreference(chatId: number, key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO preferences (chat_id, key, value) VALUES (?, ?, ?)
         ON CONFLICT(chat_id, key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`
      )
      .run(chatId, key, value);
  }

  deletePreference(chatId: number, key: string): void {
    this.db
      .prepare('DELETE FROM preferences WHERE chat_id = ? AND key = ?')
      .run(chatId, key);
  }

  // --- Alertes ---

  getAlerts(chatId: number): string[] {
    const rows = this.db
      .prepare('SELECT entity_id FROM alerts WHERE chat_id = ? AND enabled = 1')
      .all(chatId) as { entity_id: string }[];
    return rows.map((r) => r.entity_id);
  }

  setAlert(chatId: number, entityId: string, enabled: boolean): void {
    this.db
      .prepare(
        `INSERT INTO alerts (chat_id, entity_id, enabled) VALUES (?, ?, ?)
         ON CONFLICT(chat_id, entity_id) DO UPDATE SET enabled = excluded.enabled`
      )
      .run(chatId, entityId, enabled ? 1 : 0);
  }

  getAllActiveAlerts(): { chatId: number; entityId: string }[] {
    const rows = this.db
      .prepare('SELECT chat_id, entity_id FROM alerts WHERE enabled = 1')
      .all() as { chat_id: number; entity_id: string }[];
    return rows.map((r) => ({ chatId: r.chat_id, entityId: r.entity_id }));
  }
}
