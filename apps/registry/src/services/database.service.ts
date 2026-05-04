import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type {
  ServerDetail,
  ServerResponse,
  ServerSource,
  NovaMeta,
  SkillDetail,
  SkillResponse,
  SkillSource,
  AgentDetail,
  AgentResponse,
  AgentSource,
} from '@mcp-nova/types';
import { NOVA_META_NAMESPACE } from '@mcp-nova/types';
import { config } from '../config/index.js';

type TransportType = 'stdio' | 'streamable-http' | 'sse';

export interface StoredServer {
  id: number;
  name: string;
  version: string;
  source: ServerSource;
  data: string;
  transport_types: string;
  has_remote: boolean;
  has_package: boolean;
  category: string | null;
  tags: string | null;
  verified: boolean;
  featured: boolean;
  vendor_official: boolean;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

export interface StoredSkill {
  id: number;
  name: string;
  version: string;
  source: SkillSource;
  data: string;
  format: string;
  category: string | null;
  tags: string | null;
  verified: boolean;
  featured: boolean;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

export interface StoredAgent {
  id: number;
  name: string;
  version: string;
  source: AgentSource;
  data: string;
  subagent_type: string;
  category: string | null;
  tags: string | null;
  verified: boolean;
  featured: boolean;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

export interface ServerQuery {
  search?: string;
  transportType?: TransportType | TransportType[];
  source?: ServerSource | 'all';
  hasRemote?: boolean;
  hasPackage?: boolean;
  category?: string;
  tags?: string;
  verified?: boolean;
  featured?: boolean;
  vendorOfficial?: boolean;
  limit?: number;
  offset?: number;
}

export interface SkillQuery {
  search?: string;
  source?: SkillSource | 'all';
  category?: string;
  tags?: string;
  verified?: boolean;
  featured?: boolean;
  format?: string;
  limit?: number;
  offset?: number;
}

export interface AgentQuery {
  search?: string;
  source?: AgentSource | 'all';
  category?: string;
  tags?: string;
  verified?: boolean;
  featured?: boolean;
  subagentType?: string;
  limit?: number;
  offset?: number;
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
      CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('registry', 'private', 'azure-devops')),
        data TEXT NOT NULL,
        transport_types TEXT NOT NULL DEFAULT '',
        has_remote INTEGER NOT NULL DEFAULT 0,
        has_package INTEGER NOT NULL DEFAULT 0,
        category TEXT,
        tags TEXT,
        verified INTEGER NOT NULL DEFAULT 0,
        featured INTEGER NOT NULL DEFAULT 0,
        vendor_official INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        synced_at TEXT,
        UNIQUE(name, version)
      );

      CREATE INDEX IF NOT EXISTS idx_servers_name ON servers(name);
      CREATE INDEX IF NOT EXISTS idx_servers_source ON servers(source);
      CREATE INDEX IF NOT EXISTS idx_servers_transport_types ON servers(transport_types);
      CREATE INDEX IF NOT EXISTS idx_servers_updated_at ON servers(updated_at);
      CREATE INDEX IF NOT EXISTS idx_servers_category ON servers(category);
      CREATE INDEX IF NOT EXISTS idx_servers_verified ON servers(verified);
      CREATE INDEX IF NOT EXISTS idx_servers_featured ON servers(featured);

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('registry', 'private')),
        data TEXT NOT NULL,
        format TEXT NOT NULL,
        category TEXT,
        tags TEXT,
        verified INTEGER NOT NULL DEFAULT 0,
        featured INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        synced_at TEXT,
        UNIQUE(name, version)
      );

      CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
      CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source);
      CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
      CREATE INDEX IF NOT EXISTS idx_skills_verified ON skills(verified);
      CREATE INDEX IF NOT EXISTS idx_skills_featured ON skills(featured);
      CREATE INDEX IF NOT EXISTS idx_skills_format ON skills(format);

      CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('registry', 'private')),
        data TEXT NOT NULL,
        subagent_type TEXT NOT NULL,
        category TEXT,
        tags TEXT,
        verified INTEGER NOT NULL DEFAULT 0,
        featured INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        synced_at TEXT,
        UNIQUE(name, version)
      );

      CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
      CREATE INDEX IF NOT EXISTS idx_agents_source ON agents(source);
      CREATE INDEX IF NOT EXISTS idx_agents_subagent_type ON agents(subagent_type);
      CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category);
      CREATE INDEX IF NOT EXISTS idx_agents_verified ON agents(verified);
      CREATE INDEX IF NOT EXISTS idx_agents_featured ON agents(featured);

      CREATE TABLE IF NOT EXISTS sync_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_sync TEXT,
        status TEXT,
        error TEXT
      );

      INSERT OR IGNORE INTO sync_status (id, status) VALUES (1, 'pending');
    `);

    this.migrateSchema();
  }

  private migrateSchema(): void {
    // Migrate servers table
    const serverColumns = this.db.pragma('table_info(servers)') as { name: string }[];
    const serverColumnNames = serverColumns.map(c => c.name);

    if (!serverColumnNames.includes('category')) {
      this.db.exec(`ALTER TABLE servers ADD COLUMN category TEXT`);
    }
    if (!serverColumnNames.includes('tags')) {
      this.db.exec(`ALTER TABLE servers ADD COLUMN tags TEXT`);
    }
    if (!serverColumnNames.includes('verified')) {
      this.db.exec(`ALTER TABLE servers ADD COLUMN verified INTEGER NOT NULL DEFAULT 0`);
    }
    if (!serverColumnNames.includes('featured')) {
      this.db.exec(`ALTER TABLE servers ADD COLUMN featured INTEGER NOT NULL DEFAULT 0`);
    }

    // Migration: rename source='official' -> 'registry' and add vendor_official column
    // SQLite doesn't support ALTER COLUMN, so we recreate the table if needed
    if (!serverColumnNames.includes('vendor_official')) {
      this.db.exec(`
        CREATE TABLE servers_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          version TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('registry', 'private', 'azure-devops')),
          data TEXT NOT NULL,
          transport_types TEXT NOT NULL DEFAULT '',
          has_remote INTEGER NOT NULL DEFAULT 0,
          has_package INTEGER NOT NULL DEFAULT 0,
          category TEXT,
          tags TEXT,
          verified INTEGER NOT NULL DEFAULT 0,
          featured INTEGER NOT NULL DEFAULT 0,
          vendor_official INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          synced_at TEXT,
          UNIQUE(name, version)
        );

        INSERT INTO servers_new (id, name, version, source, data, transport_types, has_remote, has_package, category, tags, verified, featured, vendor_official, created_at, updated_at, synced_at)
        SELECT id, name, version,
          CASE WHEN source = 'official' THEN 'registry' ELSE source END,
          data, transport_types, has_remote, has_package,
          COALESCE(category, NULL), COALESCE(tags, NULL),
          COALESCE(verified, 0), COALESCE(featured, 0), 0,
          created_at, updated_at, synced_at
        FROM servers;

        DROP TABLE servers;
        ALTER TABLE servers_new RENAME TO servers;

        CREATE INDEX IF NOT EXISTS idx_servers_name ON servers(name);
        CREATE INDEX IF NOT EXISTS idx_servers_source ON servers(source);
        CREATE INDEX IF NOT EXISTS idx_servers_transport_types ON servers(transport_types);
        CREATE INDEX IF NOT EXISTS idx_servers_updated_at ON servers(updated_at);
        CREATE INDEX IF NOT EXISTS idx_servers_category ON servers(category);
        CREATE INDEX IF NOT EXISTS idx_servers_verified ON servers(verified);
        CREATE INDEX IF NOT EXISTS idx_servers_featured ON servers(featured);
      `);
      console.log('[Database] Migrated: renamed source=official to registry, added vendor_official column');
    }
  }

  private extractTransportTypes(server: ServerDetail): string[] {
    const types = new Set<string>();

    server.packages?.forEach((pkg) => {
      if (pkg.transport?.type) {
        types.add(pkg.transport.type);
      }
    });

    server.remotes?.forEach((remote) => {
      if (remote.type) {
        types.add(remote.type);
      }
    });

    return Array.from(types);
  }

  private extractNovaMeta(serverResponse: ServerResponse): NovaMeta | null {
    const meta = serverResponse._meta?.[NOVA_META_NAMESPACE] as NovaMeta | undefined;
    return meta ?? null;
  }

  upsertServer(serverResponse: ServerResponse, source: ServerSource): void {
    const server = serverResponse.server;
    const transportTypes = this.extractTransportTypes(server);
    const hasRemote = (server.remotes?.length ?? 0) > 0;
    const hasPackage = (server.packages?.length ?? 0) > 0;
    const novaMeta = this.extractNovaMeta(serverResponse);

    const stmt = this.db.prepare(`
      INSERT INTO servers (name, version, source, data, transport_types, has_remote, has_package, category, tags, verified, featured, vendor_official, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(name, version) DO UPDATE SET
        data = excluded.data,
        transport_types = excluded.transport_types,
        has_remote = excluded.has_remote,
        has_package = excluded.has_package,
        category = excluded.category,
        tags = excluded.tags,
        verified = excluded.verified,
        featured = excluded.featured,
        vendor_official = excluded.vendor_official,
        updated_at = datetime('now'),
        synced_at = CASE WHEN excluded.source = 'registry' THEN datetime('now') ELSE synced_at END
    `);

    stmt.run(
      server.name,
      server.version,
      source,
      JSON.stringify(serverResponse),
      transportTypes.join(','),
      hasRemote ? 1 : 0,
      hasPackage ? 1 : 0,
      novaMeta?.category ?? null,
      novaMeta?.tags?.join(',') ?? null,
      novaMeta?.verified ? 1 : 0,
      novaMeta?.featured ? 1 : 0,
      novaMeta?.vendorOfficial ? 1 : 0
    );
  }

  bulkUpsertFromOfficial(servers: ServerResponse[]): void {
    console.log(`[Database] Bulk upserting ${servers.length} servers...`);
    const transaction = this.db.transaction((servers: ServerResponse[]) => {
      for (const server of servers) {
        try {
          this.upsertServer(server, 'registry');
        } catch (err) {
          console.error(`[Database] Failed to upsert server ${server.server?.name}@${server.server?.version}:`, err);
          throw err;
        }
      }
    });
    transaction(servers);
    console.log(`[Database] Bulk upsert complete`);
  }

  getServer(name: string, version: string): ServerResponse | null {
    const stmt = this.db.prepare<[string, string], StoredServer>(`
      SELECT * FROM servers WHERE name = ? AND version = ?
    `);
    const row = stmt.get(name, version);
    if (!row) return null;
    const data = JSON.parse(row.data) as ServerResponse;
    return { ...data, source: row.source as ServerSource };
  }

  getLatestServer(name: string): ServerResponse | null {
    const stmt = this.db.prepare<[string], StoredServer>(`
      SELECT * FROM servers WHERE name = ? ORDER BY updated_at DESC LIMIT 1
    `);
    const row = stmt.get(name);
    if (!row) return null;
    const data = JSON.parse(row.data) as ServerResponse;
    return { ...data, source: row.source as ServerSource };
  }

  getServerVersions(name: string): ServerResponse[] {
    const stmt = this.db.prepare<[string], StoredServer>(`
      SELECT * FROM servers WHERE name = ? ORDER BY updated_at DESC
    `);
    const rows = stmt.all(name);
    return rows.map(row => {
      const data = JSON.parse(row.data) as ServerResponse;
      return { ...data, source: row.source as ServerSource };
    });
  }

  queryServers(query: ServerQuery = {}): { servers: ServerResponse[]; total: number } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (query.search) {
      conditions.push("(name LIKE ? OR json_extract(data, '$.server.description') LIKE ?)");
      params.push(`%${query.search}%`, `%${query.search}%`);
    }

    if (query.source && query.source !== 'all') {
      conditions.push('source = ?');
      params.push(query.source);
    }

    if (query.transportType) {
      const types = Array.isArray(query.transportType) ? query.transportType : [query.transportType];
      const typeConditions = types.map(() => 'transport_types LIKE ?');
      conditions.push(`(${typeConditions.join(' OR ')})`);
      types.forEach(t => params.push(`%${t}%`));
    }

    if (query.hasRemote !== undefined) {
      conditions.push('has_remote = ?');
      params.push(query.hasRemote ? 1 : 0);
    }

    if (query.hasPackage !== undefined) {
      conditions.push('has_package = ?');
      params.push(query.hasPackage ? 1 : 0);
    }

    if (query.category) {
      conditions.push('category = ?');
      params.push(query.category);
    }

    if (query.tags) {
      const tagList = query.tags.split(',');
      const tagConditions = tagList.map(() => 'tags LIKE ?');
      conditions.push(`(${tagConditions.join(' OR ')})`);
      tagList.forEach(t => params.push(`%${t.trim()}%`));
    }

    if (query.verified !== undefined) {
      conditions.push('verified = ?');
      params.push(query.verified ? 1 : 0);
    }

    if (query.featured !== undefined) {
      conditions.push('featured = ?');
      params.push(query.featured ? 1 : 0);
    }

    if (query.vendorOfficial !== undefined) {
      conditions.push('vendor_official = ?');
      params.push(query.vendorOfficial ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const countStmt = this.db.prepare<(string | number)[], { count: number }>(`
      SELECT COUNT(*) as count FROM servers ${whereClause}
    `);
    const { count: total } = countStmt.get(...params) ?? { count: 0 };

    const stmt = this.db.prepare<(string | number)[], StoredServer>(`
      SELECT * FROM servers ${whereClause}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(...params, limit, offset);

    return {
      servers: rows.map(row => {
        const serverResponse = JSON.parse(row.data) as ServerResponse;
        return {
          ...serverResponse,
          source: row.source as ServerSource,
        };
      }),
      total,
    };
  }

  deleteServer(name: string, version: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM servers WHERE name = ? AND version = ? AND source != 'registry'
    `);
    const result = stmt.run(name, version);
    return result.changes > 0;
  }

  deleteAllServerVersions(name: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM servers WHERE name = ? AND source != 'registry'
    `);
    const result = stmt.run(name);
    return result.changes;
  }

  updateSyncStatus(status: 'syncing' | 'success' | 'error', error?: string): void {
    const stmt = this.db.prepare(`
      UPDATE sync_status 
      SET last_sync = datetime('now'), status = ?, error = ?
      WHERE id = 1
    `);
    stmt.run(status, error ?? null);
  }

  getSyncStatus(): { lastSync: string | null; status: string; error: string | null } {
    const stmt = this.db.prepare<[], { last_sync: string | null; status: string; error: string | null }>(`
      SELECT last_sync, status, error FROM sync_status WHERE id = 1
    `);
    const row = stmt.get();
    return {
      lastSync: row?.last_sync ?? null,
      status: row?.status ?? 'unknown',
      error: row?.error ?? null,
    };
  }

  createUser(username: string, passwordHash: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO users (username, password_hash) VALUES (?, ?)
      ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, updated_at = datetime('now')
    `);
    stmt.run(username, passwordHash);
  }

  getUser(username: string): { id: number; username: string; passwordHash: string; role: string } | null {
    const stmt = this.db.prepare<[string], { id: number; username: string; password_hash: string; role: string }>(`
      SELECT id, username, password_hash, role FROM users WHERE username = ?
    `);
    const row = stmt.get(username);
    return row ? { id: row.id, username: row.username, passwordHash: row.password_hash, role: row.role } : null;
  }


  // ────────────────────────────── Skills ──────────────────────────────

  private extractSkillNovaMeta(skillResponse: SkillResponse): NovaMeta | null {
    const meta = skillResponse._meta?.[NOVA_META_NAMESPACE] as NovaMeta | undefined;
    return meta ?? null;
  }

  upsertSkill(skillResponse: SkillResponse, source: SkillSource): void {
    const skill = skillResponse.skill;
    const novaMeta = this.extractSkillNovaMeta(skillResponse);

    const stmt = this.db.prepare(`
      INSERT INTO skills (name, version, source, data, format, category, tags, verified, featured, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(name, version) DO UPDATE SET
        data = excluded.data,
        format = excluded.format,
        category = excluded.category,
        tags = excluded.tags,
        verified = excluded.verified,
        featured = excluded.featured,
        updated_at = datetime('now'),
        synced_at = CASE WHEN excluded.source = 'registry' THEN datetime('now') ELSE synced_at END
    `);

    stmt.run(
      skill.name,
      skill.version,
      source,
      JSON.stringify(skillResponse),
      skill.format,
      novaMeta?.category ?? skill.category ?? null,
      novaMeta?.tags?.join(',') ?? skill.tags?.join(',') ?? null,
      novaMeta?.verified ? 1 : 0,
      novaMeta?.featured ? 1 : 0
    );
  }

  bulkUpsertSkills(skills: SkillResponse[]): void {
    console.log(`[Database] Bulk upserting ${skills.length} skills...`);
    const transaction = this.db.transaction((skills: SkillResponse[]) => {
      for (const skill of skills) {
        try {
          this.upsertSkill(skill, 'registry');
        } catch (err) {
          console.error(`[Database] Failed to upsert skill ${skill.skill?.name}@${skill.skill?.version}:`, err);
          throw err;
        }
      }
    });
    transaction(skills);
    console.log(`[Database] Bulk upsert skills complete`);
  }

  getSkill(name: string, version: string): SkillResponse | null {
    const stmt = this.db.prepare<[string, string], StoredSkill>(`
      SELECT * FROM skills WHERE name = ? AND version = ?
    `);
    const row = stmt.get(name, version);
    if (!row) return null;
    const data = JSON.parse(row.data) as SkillResponse;
    return { ...data, source: row.source as SkillSource };
  }

  getLatestSkill(name: string): SkillResponse | null {
    const stmt = this.db.prepare<[string], StoredSkill>(`
      SELECT * FROM skills WHERE name = ? ORDER BY updated_at DESC LIMIT 1
    `);
    const row = stmt.get(name);
    if (!row) return null;
    const data = JSON.parse(row.data) as SkillResponse;
    return { ...data, source: row.source as SkillSource };
  }

  getSkillVersions(name: string): SkillResponse[] {
    const stmt = this.db.prepare<[string], StoredSkill>(`
      SELECT * FROM skills WHERE name = ? ORDER BY updated_at DESC
    `);
    const rows = stmt.all(name);
    return rows.map(row => {
      const data = JSON.parse(row.data) as SkillResponse;
      return { ...data, source: row.source as SkillSource };
    });
  }

  querySkills(query: SkillQuery = {}): { skills: SkillResponse[]; total: number } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (query.search) {
      conditions.push("(name LIKE ? OR json_extract(data, '$.skill.description') LIKE ?)");
      params.push(`%${query.search}%`, `%${query.search}%`);
    }

    if (query.source && query.source !== 'all') {
      conditions.push('source = ?');
      params.push(query.source);
    }

    if (query.category) {
      conditions.push('category = ?');
      params.push(query.category);
    }

    if (query.tags) {
      const tagList = query.tags.split(',');
      const tagConditions = tagList.map(() => 'tags LIKE ?');
      conditions.push(`(${tagConditions.join(' OR ')})`);
      tagList.forEach(t => params.push(`%${t.trim()}%`));
    }

    if (query.format) {
      conditions.push('format = ?');
      params.push(query.format);
    }

    if (query.verified !== undefined) {
      conditions.push('verified = ?');
      params.push(query.verified ? 1 : 0);
    }

    if (query.featured !== undefined) {
      conditions.push('featured = ?');
      params.push(query.featured ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const countStmt = this.db.prepare<(string | number)[], { count: number }>(`
      SELECT COUNT(*) as count FROM skills ${whereClause}
    `);
    const { count: total } = countStmt.get(...params) ?? { count: 0 };

    const stmt = this.db.prepare<(string | number)[], StoredSkill>(`
      SELECT * FROM skills ${whereClause}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(...params, limit, offset);

    return {
      skills: rows.map(row => {
        const skillResponse = JSON.parse(row.data) as SkillResponse;
        return { ...skillResponse, source: row.source as SkillSource };
      }),
      total,
    };
  }

  deleteSkill(name: string, version: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM skills WHERE name = ? AND version = ? AND source != 'registry'
    `);
    const result = stmt.run(name, version);
    return result.changes > 0;
  }

  deleteAllSkillVersions(name: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM skills WHERE name = ? AND source != 'registry'
    `);
    const result = stmt.run(name);
    return result.changes;
  }

  // ────────────────────────────── Agents ──────────────────────────────

  private extractAgentNovaMeta(agentResponse: AgentResponse): NovaMeta | null {
    const meta = agentResponse._meta?.[NOVA_META_NAMESPACE] as NovaMeta | undefined;
    return meta ?? null;
  }

  upsertAgent(agentResponse: AgentResponse, source: AgentSource): void {
    const agent = agentResponse.agent;
    const novaMeta = this.extractAgentNovaMeta(agentResponse);

    const stmt = this.db.prepare(`
      INSERT INTO agents (name, version, source, data, subagent_type, category, tags, verified, featured, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(name, version) DO UPDATE SET
        data = excluded.data,
        subagent_type = excluded.subagent_type,
        category = excluded.category,
        tags = excluded.tags,
        verified = excluded.verified,
        featured = excluded.featured,
        updated_at = datetime('now'),
        synced_at = CASE WHEN excluded.source = 'registry' THEN datetime('now') ELSE synced_at END
    `);

    stmt.run(
      agent.name,
      agent.version,
      source,
      JSON.stringify(agentResponse),
      agent.subagent_type,
      novaMeta?.category ?? agent.category ?? null,
      novaMeta?.tags?.join(',') ?? agent.tags?.join(',') ?? null,
      novaMeta?.verified ? 1 : 0,
      novaMeta?.featured ? 1 : 0
    );
  }

  bulkUpsertAgents(agents: AgentResponse[]): void {
    console.log(`[Database] Bulk upserting ${agents.length} agents...`);
    const transaction = this.db.transaction((agents: AgentResponse[]) => {
      for (const agent of agents) {
        try {
          this.upsertAgent(agent, 'registry');
        } catch (err) {
          console.error(`[Database] Failed to upsert agent ${agent.agent?.name}@${agent.agent?.version}:`, err);
          throw err;
        }
      }
    });
    transaction(agents);
    console.log(`[Database] Bulk upsert agents complete`);
  }

  getAgent(name: string, version: string): AgentResponse | null {
    const stmt = this.db.prepare<[string, string], StoredAgent>(`
      SELECT * FROM agents WHERE name = ? AND version = ?
    `);
    const row = stmt.get(name, version);
    if (!row) return null;
    const data = JSON.parse(row.data) as AgentResponse;
    return { ...data, source: row.source as AgentSource };
  }

  getLatestAgent(name: string): AgentResponse | null {
    const stmt = this.db.prepare<[string], StoredAgent>(`
      SELECT * FROM agents WHERE name = ? ORDER BY updated_at DESC LIMIT 1
    `);
    const row = stmt.get(name);
    if (!row) return null;
    const data = JSON.parse(row.data) as AgentResponse;
    return { ...data, source: row.source as AgentSource };
  }

  getAgentVersions(name: string): AgentResponse[] {
    const stmt = this.db.prepare<[string], StoredAgent>(`
      SELECT * FROM agents WHERE name = ? ORDER BY updated_at DESC
    `);
    const rows = stmt.all(name);
    return rows.map(row => {
      const data = JSON.parse(row.data) as AgentResponse;
      return { ...data, source: row.source as AgentSource };
    });
  }

  queryAgents(query: AgentQuery = {}): { agents: AgentResponse[]; total: number } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (query.search) {
      conditions.push("(name LIKE ? OR json_extract(data, '$.agent.description') LIKE ? OR json_extract(data, '$.agent.instructions') LIKE ?)");
      params.push(`%${query.search}%`, `%${query.search}%`, `%${query.search}%`);
    }

    if (query.source && query.source !== 'all') {
      conditions.push('source = ?');
      params.push(query.source);
    }

    if (query.subagentType) {
      conditions.push('subagent_type = ?');
      params.push(query.subagentType);
    }

    if (query.category) {
      conditions.push('category = ?');
      params.push(query.category);
    }

    if (query.tags) {
      const tagList = query.tags.split(',');
      const tagConditions = tagList.map(() => 'tags LIKE ?');
      conditions.push(`(${tagConditions.join(' OR ')})`);
      tagList.forEach(t => params.push(`%${t.trim()}%`));
    }

    if (query.verified !== undefined) {
      conditions.push('verified = ?');
      params.push(query.verified ? 1 : 0);
    }

    if (query.featured !== undefined) {
      conditions.push('featured = ?');
      params.push(query.featured ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const countStmt = this.db.prepare<(string | number)[], { count: number }>(`
      SELECT COUNT(*) as count FROM agents ${whereClause}
    `);
    const { count: total } = countStmt.get(...params) ?? { count: 0 };

    const stmt = this.db.prepare<(string | number)[], StoredAgent>(`
      SELECT * FROM agents ${whereClause}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(...params, limit, offset);

    return {
      agents: rows.map(row => {
        const agentResponse = JSON.parse(row.data) as AgentResponse;
        return { ...agentResponse, source: row.source as AgentSource };
      }),
      total,
    };
  }

  deleteAgent(name: string, version: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM agents WHERE name = ? AND version = ? AND source != 'registry'
    `);
    const result = stmt.run(name, version);
    return result.changes > 0;
  }

  deleteAllAgentVersions(name: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM agents WHERE name = ? AND source != 'registry'
    `);
    const result = stmt.run(name);
    return result.changes;
  }

  // ────────────────────────────── Close ──────────────────────────────

  close(): void {
    this.db.close();
  }
}

export const databaseService = new DatabaseService();
