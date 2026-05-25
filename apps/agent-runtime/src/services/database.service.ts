import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config/index.js';

export type AgentInstanceStatus = 'stopped' | 'starting' | 'online' | 'stopping' | 'errored';

export interface StoredAgentInstance {
  id: string;
  agent_name: string;
  agent_version: string;
  status: string;
  exec_cmd: string;
  exec_args: string | null;
  env_json: string | null;
  agent_snapshot_json: string | null;
  resolved_skills: string | null;
  resolved_mcp_instances: string | null;
  composed_prompt: string | null;
  pm2_name: string | null;
  pid: number | null;
  uptime_ms: number | null;
  restart_count: number | null;
  last_exit_code: number | null;
  last_error: string | null;
  last_started_at: string | null;
  last_stopped_at: string | null;
  last_invoked_at: string | null;
  last_composed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoredInvocation {
  id: number;
  instance_id: string;
  input: string;
  output: string | null;
  status: string;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

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
      CREATE TABLE IF NOT EXISTS agent_instances (
        id TEXT PRIMARY KEY,
        agent_name TEXT NOT NULL,
        agent_version TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'stopped'
          CHECK (status IN ('stopped', 'starting', 'online', 'stopping', 'errored')),
        exec_cmd TEXT NOT NULL DEFAULT '',
        exec_args TEXT,
        env_json TEXT,
        resolved_skills TEXT,
        resolved_mcp_instances TEXT,
        composed_prompt TEXT,
        pm2_name TEXT,
        pid INTEGER,
        uptime_ms INTEGER,
        restart_count INTEGER,
        last_exit_code INTEGER,
        last_error TEXT,
        last_started_at TEXT,
        last_stopped_at TEXT,
        last_invoked_at TEXT,
        last_composed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS agent_invocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id TEXT NOT NULL,
        input TEXT NOT NULL DEFAULT '',
        output TEXT,
        status TEXT NOT NULL CHECK (status IN ('success', 'error', 'pending')),
        error TEXT,
        duration_ms INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    this.normalizeAgentInstancesSchema();
    this.ensureColumn('agent_instances', 'env_json', 'TEXT');
    this.ensureColumn('agent_instances', 'last_started_at', 'TEXT');
    this.ensureColumn('agent_instances', 'last_stopped_at', 'TEXT');
    this.ensureColumn('agent_instances', 'last_invoked_at', 'TEXT');
    this.ensureColumn('agent_instances', 'last_composed_at', 'TEXT');
    this.ensureColumn('agent_instances', 'agent_snapshot_json', 'TEXT');

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_instances_name ON agent_instances(agent_name);
      CREATE INDEX IF NOT EXISTS idx_agent_instances_status ON agent_instances(status);
      CREATE INDEX IF NOT EXISTS idx_agent_instances_pm2_name ON agent_instances(pm2_name);
      CREATE INDEX IF NOT EXISTS idx_agent_invocations_instance ON agent_invocations(instance_id);
    `);
  }

  private normalizeAgentInstancesSchema(): void {
    const columns = this.db.prepare('PRAGMA table_info(agent_instances)').all() as { name: string; notnull: number }[];
    const pm2Name = columns.find((column) => column.name === 'pm2_name');
    if (!pm2Name?.notnull) return;

    console.log('[Database] Migrating agent_instances.pm2_name to nullable');

    this.db.exec(`
      DROP INDEX IF EXISTS idx_agent_instances_name;
      DROP INDEX IF EXISTS idx_agent_instances_status;
      DROP INDEX IF EXISTS idx_agent_instances_pm2_name;

      ALTER TABLE agent_instances RENAME TO agent_instances_legacy;

      CREATE TABLE agent_instances (
        id TEXT PRIMARY KEY,
        agent_name TEXT NOT NULL,
        agent_version TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'stopped'
          CHECK (status IN ('stopped', 'starting', 'online', 'stopping', 'errored')),
        exec_cmd TEXT NOT NULL DEFAULT '',
        exec_args TEXT,
        env_json TEXT,
        resolved_skills TEXT,
        resolved_mcp_instances TEXT,
        composed_prompt TEXT,
        pm2_name TEXT,
        pid INTEGER,
        uptime_ms INTEGER,
        restart_count INTEGER,
        last_exit_code INTEGER,
        last_error TEXT,
        last_started_at TEXT,
        last_stopped_at TEXT,
        last_invoked_at TEXT,
        last_composed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO agent_instances (
        id,
        agent_name,
        agent_version,
        status,
        exec_cmd,
        exec_args,
        env_json,
        resolved_skills,
        resolved_mcp_instances,
        composed_prompt,
        pm2_name,
        pid,
        uptime_ms,
        restart_count,
        last_exit_code,
        last_error,
        created_at,
        updated_at
      )
      SELECT
        id,
        agent_name,
        agent_version,
        status,
        exec_cmd,
        exec_args,
        NULL,
        resolved_skills,
        resolved_mcp_instances,
        composed_prompt,
        NULLIF(pm2_name, ''),
        pid,
        uptime_ms,
        restart_count,
        last_exit_code,
        last_error,
        created_at,
        updated_at
      FROM agent_instances_legacy;

      DROP TABLE agent_instances_legacy;
    `);
  }

  private ensureColumn(tableName: string, columnName: string, columnType: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
    if (!columns.some((column) => column.name === columnName)) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
    }
  }

  createInstance(data: {
    id: string;
    agent_name: string;
    agent_version: string;
    pm2_name: string | null;
    exec_cmd: string;
    exec_args?: string[];
    env_json?: Record<string, string>;
    agent_snapshot_json?: string;
    resolved_skills?: string;
    resolved_mcp_instances?: string;
    composed_prompt?: string;
  }): StoredAgentInstance {
    const stmt = this.db.prepare(`
      INSERT INTO agent_instances (id, agent_name, agent_version, status, exec_cmd, exec_args, env_json, agent_snapshot_json, resolved_skills, resolved_mcp_instances, composed_prompt, pm2_name)
      VALUES (?, ?, ?, 'stopped', ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      data.id,
      data.agent_name,
      data.agent_version,
      data.exec_cmd,
      data.exec_args ? JSON.stringify(data.exec_args) : null,
      data.env_json ? JSON.stringify(data.env_json) : null,
      data.agent_snapshot_json ?? null,
      data.resolved_skills ?? null,
      data.resolved_mcp_instances ?? null,
      data.composed_prompt ?? null,
      data.pm2_name,
    );
    return this.getInstance(data.id)!;
  }

  getInstance(id: string): StoredAgentInstance | null {
    const stmt = this.db.prepare<[string], StoredAgentInstance>(`
      SELECT * FROM agent_instances WHERE id = ?
    `);
    return stmt.get(id) ?? null;
  }

  listInstances(): StoredAgentInstance[] {
    const stmt = this.db.prepare<[], StoredAgentInstance>(`
      SELECT * FROM agent_instances ORDER BY updated_at DESC
    `);
    return stmt.all();
  }

  getInstanceByPM2Name(pm2Name: string): StoredAgentInstance | null {
    const stmt = this.db.prepare<[string], StoredAgentInstance>(`
      SELECT * FROM agent_instances WHERE pm2_name = ?
    `);
    return stmt.get(pm2Name) ?? null;
  }

  updateInstanceStatus(id: string, status: AgentInstanceStatus, extra: {
    pid?: number;
    uptime_ms?: number;
    restart_count?: number;
    last_exit_code?: number;
    last_error?: string;
    last_started_at?: string;
    last_stopped_at?: string;
    last_invoked_at?: string;
    last_composed_at?: string;
  } = {}): void {
    const stmt = this.db.prepare(`
      UPDATE agent_instances
      SET
        status = ?,
        pid = ?,
        uptime_ms = ?,
        restart_count = ?,
        last_exit_code = ?,
        last_error = ?,
        last_started_at = COALESCE(?, last_started_at),
        last_stopped_at = COALESCE(?, last_stopped_at),
        last_invoked_at = COALESCE(?, last_invoked_at),
        last_composed_at = COALESCE(?, last_composed_at),
        updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(
      status,
      extra.pid ?? null,
      extra.uptime_ms ?? null,
      extra.restart_count ?? null,
      extra.last_exit_code ?? null,
      extra.last_error ?? null,
      extra.last_started_at ?? null,
      extra.last_stopped_at ?? null,
      extra.last_invoked_at ?? null,
      extra.last_composed_at ?? null,
      id,
    );
  }

  updateInstance(id: string, data: Partial<Pick<StoredAgentInstance, 'exec_cmd' | 'exec_args' | 'env_json' | 'resolved_skills' | 'resolved_mcp_instances' | 'composed_prompt'>>): void {
    const fields: string[] = ['updated_at = datetime(\'now\')'];
    const values: unknown[] = [];

    if (data.exec_cmd !== undefined) { fields.push('exec_cmd = ?'); values.push(data.exec_cmd); }
    if (data.exec_args !== undefined) { fields.push('exec_args = ?'); values.push(JSON.stringify(data.exec_args)); }
    if (data.env_json !== undefined) { fields.push('env_json = ?'); values.push(data.env_json); }
    if (data.resolved_skills !== undefined) { fields.push('resolved_skills = ?'); values.push(data.resolved_skills); }
    if (data.resolved_mcp_instances !== undefined) { fields.push('resolved_mcp_instances = ?'); values.push(data.resolved_mcp_instances); }
    if (data.composed_prompt !== undefined) { fields.push('composed_prompt = ?'); values.push(data.composed_prompt); }

    values.push(id);
    const stmt = this.db.prepare(`UPDATE agent_instances SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  markVolatileInstancesStopped(): number {
    const stmt = this.db.prepare(`
      UPDATE agent_instances
      SET status = 'stopped', updated_at = datetime('now')
      WHERE status IN ('starting', 'online', 'stopping')
    `);
    return stmt.run().changes;
  }

  deleteInstance(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM agent_instances WHERE id = ?');
    return stmt.run(id).changes > 0;
  }

  recordInvocation(data: {
    instance_id: string;
    input: string;
    output?: string;
    status: 'success' | 'error' | 'pending';
    error?: string;
    duration_ms?: number;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO agent_invocations (instance_id, input, output, status, error, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(data.instance_id, data.input, data.output ?? null, data.status, data.error ?? null, data.duration_ms ?? null);
    this.pruneInvocations(data.instance_id);
    return Number(result.lastInsertRowid);
  }

  updateInvocation(id: number, data: {
    output?: string;
    status: 'success' | 'error';
    error?: string;
    duration_ms?: number;
  }): void {
    const stmt = this.db.prepare(`
      UPDATE agent_invocations
      SET output = ?, status = ?, error = ?, duration_ms = ?
      WHERE id = ?
    `);
    stmt.run(data.output ?? null, data.status, data.error ?? null, data.duration_ms ?? null, id);
  }

  private pruneInvocations(instanceId: string, keep = 100): void {
    const stmt = this.db.prepare(`
      DELETE FROM agent_invocations
      WHERE instance_id = ?
        AND id NOT IN (
          SELECT id FROM agent_invocations
          WHERE instance_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT ?
        )
    `);
    stmt.run(instanceId, instanceId, keep);
  }

  getInvocations(instanceId: string, limit = 50): StoredInvocation[] {
    const stmt = this.db.prepare<[string, number], StoredInvocation>(`
      SELECT * FROM agent_invocations WHERE instance_id = ? ORDER BY created_at DESC LIMIT ?
    `);
    return stmt.all(instanceId, limit);
  }

  close(): void {
    this.db.close();
  }
}

export const databaseService = new DatabaseService();
