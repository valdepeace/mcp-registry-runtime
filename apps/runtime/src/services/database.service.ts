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
      CREATE TABLE IF NOT EXISTS runtime_instances (
        id TEXT PRIMARY KEY,
        server_name TEXT NOT NULL,
        version TEXT NOT NULL,
        source TEXT,
        exec_cmd TEXT NOT NULL,
        exec_args TEXT,
        cwd TEXT,
        env_json TEXT,
        port INTEGER,
        endpoint_url TEXT,
        health_url TEXT,
        pm2_name TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'stopped',
        pid INTEGER,
        uptime_ms INTEGER,
        restart_count INTEGER,
        last_exit_code INTEGER,
        last_error TEXT,
        health_status TEXT,
        last_health_check TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_runtime_server_version ON runtime_instances(server_name, version);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_pm2_name ON runtime_instances(pm2_name);

      CREATE TABLE IF NOT EXISTS inspect_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        args_json TEXT NOT NULL,
        result_json TEXT,
        status TEXT NOT NULL CHECK (status IN ('success', 'error')),
        error TEXT,
        duration_ms INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_inspect_history_instance ON inspect_history(instance_id, created_at);
    `);

    this.migrateSchema();
  }

  private migrateSchema(): void {
    const runtimeColumns = this.db.pragma('table_info(runtime_instances)') as { name: string }[];
    const runtimeColumnNames = runtimeColumns.map(c => c.name);

    if (!runtimeColumnNames.includes('health_status')) {
      this.db.exec(`ALTER TABLE runtime_instances ADD COLUMN health_status TEXT`);
    }
    if (!runtimeColumnNames.includes('last_health_check')) {
      this.db.exec(`ALTER TABLE runtime_instances ADD COLUMN last_health_check TEXT`);
    }
  }

  insertInspectHistory(entry: {
    instance_id: string;
    tool_name: string;
    args_json: string;
    result_json?: string;
    status: 'success' | 'error';
    error?: string;
    duration_ms: number;
  }): void {
    this.db.prepare(`
      INSERT INTO inspect_history (instance_id, tool_name, args_json, result_json, status, error, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.instance_id,
      entry.tool_name,
      entry.args_json,
      entry.result_json ?? null,
      entry.status,
      entry.error ?? null,
      entry.duration_ms
    );
    this.db.prepare(`
      DELETE FROM inspect_history
      WHERE instance_id = ? AND id NOT IN (
        SELECT id FROM inspect_history WHERE instance_id = ? ORDER BY created_at DESC LIMIT 100
      )
    `).run(entry.instance_id, entry.instance_id);
  }

  listInspectHistory(instanceId: string, limit = 50): {
    id: number;
    tool_name: string;
    args_json: string;
    result_json: string | null;
    status: string;
    error: string | null;
    duration_ms: number | null;
    created_at: string;
  }[] {
    return this.db.prepare(`
      SELECT id, tool_name, args_json, result_json, status, error, duration_ms, created_at
      FROM inspect_history
      WHERE instance_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(instanceId, limit) as {
      id: number;
      tool_name: string;
      args_json: string;
      result_json: string | null;
      status: string;
      error: string | null;
      duration_ms: number | null;
      created_at: string;
    }[];
  }

  close(): void {
    this.db.close();
  }
}

export const databaseService = new DatabaseService();
