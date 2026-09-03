import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config/index.js';

export class DatabaseService {
  public db: Database.Database;

  constructor() {
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(config.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS a2a_api_keys (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        key_hash TEXT UNIQUE NOT NULL,
        key_prefix TEXT NOT NULL,
        requests_per_min INTEGER NOT NULL DEFAULT 30,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        revoked_at TEXT
      );

      CREATE TABLE IF NOT EXISTS a2a_requests (
        id TEXT PRIMARY KEY,
        key_id TEXT NOT NULL,
        key_label TEXT NOT NULL,
        skill TEXT NOT NULL,
        status TEXT NOT NULL,
        input_json TEXT,
        result_json TEXT,
        error TEXT,
        instance_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_a2a_requests_created ON a2a_requests(created_at DESC);
    `);
  }

  close(): void {
    this.db.close();
  }
}

export const databaseService = new DatabaseService();
