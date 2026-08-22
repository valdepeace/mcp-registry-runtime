import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type {
  ServerDetail,
  ServerResponse,
  ServerSource,
  RegistryMeta,
  SkillDetail,
  SkillResponse,
  SkillSource,
} from '@mcp/types';
import { REGISTRY_META_NAMESPACE } from '@mcp/types';
import { config } from '../config/index.js';

type TransportType = 'stdio' | 'streamable-http' | 'sse';

export interface StoredServer {
  id: number;
  name: string;
  version: string;
  source: ServerSource;
  origin: string;
  data: string;
  transport_types: string;
  has_remote: boolean;
  has_package: boolean;
  category: string | null;
  tags: string | null;
  verified: boolean;
  featured: boolean;
  vendor_official: boolean;
  provider_name: string;
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
  provider_name: string;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

export interface ServerQuery {
  search?: string;
  transportType?: TransportType | TransportType[];
  source?: ServerSource | 'all';
  origin?: string;
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
  provider_name?: string;
  category?: string;
  tags?: string;
  verified?: boolean;
  featured?: boolean;
  format?: string;
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
        origin TEXT NOT NULL DEFAULT '',
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

      CREATE TABLE IF NOT EXISTS sync_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_sync TEXT,
        status TEXT,
        error TEXT
      );

      INSERT OR IGNORE INTO sync_status (id, status) VALUES (1, 'pending');

      CREATE TABLE IF NOT EXISTS provider_sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_name TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('servers', 'skills')),
        entity_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_provider_sync_log_provider ON provider_sync_log(provider_name);
      CREATE INDEX IF NOT EXISTS idx_provider_sync_log_type ON provider_sync_log(entity_type);
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

    // Migrate skills table: add provider_name column + new UNIQUE constraint
    const skillColumns = this.db.pragma('table_info(skills)') as { name: string }[];
    const skillColumnNames = skillColumns.map(c => c.name);

    if (!skillColumnNames.includes('provider_name')) {
      this.db.exec(`
        CREATE TABLE skills_new (
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
          provider_name TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          synced_at TEXT,
          UNIQUE(name, version, provider_name)
        );

        INSERT INTO skills_new (id, name, version, source, data, format, category, tags, verified, featured, provider_name, created_at, updated_at, synced_at)
        SELECT id, name, version, source, data, format, category, tags, verified, featured, '', created_at, updated_at, synced_at
        FROM skills;

        DROP TABLE skills;
        ALTER TABLE skills_new RENAME TO skills;

        CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
        CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source);
        CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
        CREATE INDEX IF NOT EXISTS idx_skills_verified ON skills(verified);
        CREATE INDEX IF NOT EXISTS idx_skills_featured ON skills(featured);
        CREATE INDEX IF NOT EXISTS idx_skills_format ON skills(format);
        CREATE INDEX IF NOT EXISTS idx_skills_provider_name ON skills(provider_name);
      `);
      console.log('[Database] Migrated: added provider_name column to skills table');
    }

    // Migrate servers table: add provider_name column + new UNIQUE constraint
    if (!serverColumnNames.includes('provider_name')) {
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
          provider_name TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          synced_at TEXT,
          UNIQUE(name, version, provider_name)
        );

        INSERT INTO servers_new (id, name, version, source, data, transport_types, has_remote, has_package, category, tags, verified, featured, vendor_official, provider_name, created_at, updated_at, synced_at)
        SELECT id, name, version, source, data, transport_types, has_remote, has_package, category, tags, verified, featured, vendor_official, '', created_at, updated_at, synced_at
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
        CREATE INDEX IF NOT EXISTS idx_servers_provider_name ON servers(provider_name);
      `);
      console.log('[Database] Migrated: added provider_name column to servers table');
    }

    // Migrate servers table: add origin column
    if (!serverColumnNames.includes('origin')) {
      this.db.exec(`
        CREATE TABLE servers_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          version TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('registry', 'private', 'azure-devops')),
          origin TEXT NOT NULL DEFAULT '',
          data TEXT NOT NULL,
          transport_types TEXT NOT NULL DEFAULT '',
          has_remote INTEGER NOT NULL DEFAULT 0,
          has_package INTEGER NOT NULL DEFAULT 0,
          category TEXT,
          tags TEXT,
          verified INTEGER NOT NULL DEFAULT 0,
          featured INTEGER NOT NULL DEFAULT 0,
          vendor_official INTEGER NOT NULL DEFAULT 0,
          provider_name TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          synced_at TEXT,
          UNIQUE(name, version, provider_name)
        );

        INSERT INTO servers_new (id, name, version, source, origin, data, transport_types, has_remote, has_package, category, tags, verified, featured, vendor_official, provider_name, created_at, updated_at, synced_at)
        SELECT id, name, version, source, '', data, transport_types, has_remote, has_package, category, tags, verified, featured, vendor_official, provider_name, created_at, updated_at, synced_at
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
        CREATE INDEX IF NOT EXISTS idx_servers_provider_name ON servers(provider_name);
      `);
      console.log('[Database] Migrated: added origin column to servers table');
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

  private extractRegistryMeta(serverResponse: ServerResponse): RegistryMeta | null {
    const meta = serverResponse._meta?.[REGISTRY_META_NAMESPACE] as RegistryMeta | undefined;
    return meta ?? null;
  }

  upsertServer(serverResponse: ServerResponse, source: ServerSource, providerName: string): void {
    const server = serverResponse.server;
    const transportTypes = this.extractTransportTypes(server);
    const hasRemote = (server.remotes?.length ?? 0) > 0;
    const hasPackage = (server.packages?.length ?? 0) > 0;
    const registryMeta = this.extractRegistryMeta(serverResponse);
    const origin = serverResponse.origin ?? server.origin ?? providerName;

    const stmt = this.db.prepare(`
      INSERT INTO servers (name, version, source, origin, data, transport_types, has_remote, has_package, category, tags, verified, featured, vendor_official, provider_name, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(name, version, provider_name) DO UPDATE SET
        origin = excluded.origin,
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
      origin,
      JSON.stringify(serverResponse),
      transportTypes.join(','),
      hasRemote ? 1 : 0,
      hasPackage ? 1 : 0,
      registryMeta?.category ?? null,
      registryMeta?.tags?.join(',') ?? null,
      registryMeta?.verified ? 1 : 0,
      registryMeta?.featured ? 1 : 0,
      registryMeta?.vendorOfficial ? 1 : 0,
      providerName,
    );
  }

  bulkUpsertFromOfficial(servers: ServerResponse[], providerName: string): void {
    console.log(`[Database] Bulk upserting ${servers.length} servers from ${providerName}...`);
    const transaction = this.db.transaction((items: ServerResponse[]) => {
      for (const server of items) {
        try {
          this.upsertServer(server, 'registry', providerName);
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
      ORDER BY CASE provider_name
        WHEN 'mcp-official' THEN 0
        WHEN 'smithery-servers' THEN 1
        ELSE 2
      END
      LIMIT 1
    `);
    const row = stmt.get(name, version);
    if (!row) return null;
    const data = JSON.parse(row.data) as ServerResponse;
    return { ...data, source: row.source as ServerSource, origin: row.origin, provider_name: row.provider_name };
  }

  getLatestServer(name: string): ServerResponse | null {
    const stmt = this.db.prepare<[string], StoredServer>(`
      SELECT * FROM servers WHERE name = ?
      ORDER BY CASE provider_name
        WHEN 'mcp-official' THEN 0
        WHEN 'smithery-servers' THEN 1
        ELSE 2
      END,
      updated_at DESC
      LIMIT 1
    `);
    const row = stmt.get(name);
    if (!row) return null;
    const data = JSON.parse(row.data) as ServerResponse;
    return { ...data, source: row.source as ServerSource, origin: row.origin, provider_name: row.provider_name };
  }

  getServerVersions(name: string): ServerResponse[] {
    const stmt = this.db.prepare<[string], StoredServer & { rn: number }>(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY version ORDER BY
          CASE provider_name
            WHEN 'mcp-official' THEN 0
            WHEN 'smithery-servers' THEN 1
            ELSE 2
          END,
          updated_at DESC
        ) as rn
        FROM servers
        WHERE name = ?
      ) WHERE rn = 1
      ORDER BY updated_at DESC
    `);
    const rows = stmt.all(name);
    return rows.map(row => {
      const data = JSON.parse(row.data) as ServerResponse;
      return { ...data, source: row.source as ServerSource, origin: row.origin, provider_name: row.provider_name };
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

    if (query.origin) {
      conditions.push('origin = ?');
      params.push(query.origin);
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

    const providerOrder = `
      CASE provider_name
        WHEN 'mcp-official' THEN 0
        WHEN 'smithery-servers' THEN 1
        ELSE 2
      END
    `;

    const countStmt = this.db.prepare<(string | number)[], { count: number }>(`
      SELECT COUNT(*) as count FROM (
        SELECT name, version, ROW_NUMBER() OVER (PARTITION BY name, version ORDER BY ${providerOrder}, updated_at DESC) as rn
        FROM servers ${whereClause}
      ) WHERE rn = 1
    `);
    const { count: total } = countStmt.get(...params) ?? { count: 0 };

    const stmt = this.db.prepare<(string | number)[], StoredServer & { rn: number }>(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY name, version ORDER BY ${providerOrder}, updated_at DESC) as rn
        FROM servers ${whereClause}
      ) WHERE rn = 1
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
          origin: row.origin,
          provider_name: row.provider_name,
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

  // ── Provider sync log ──────────────────────────────────────────────

  logProviderSync(providerName: string, entityType: 'servers' | 'skills', count: number, status: 'success' | 'error', error?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO provider_sync_log (provider_name, entity_type, entity_count, status, error)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(providerName, entityType, count, status, error ?? null);
  }

  getProviderSyncStats(): Array<{ providerName: string; entityType: string; entityCount: number; lastSync: string | null; lastStatus: string; lastError: string | null }> {
    const stmt = this.db.prepare(`
      SELECT
        provider_name,
        entity_type,
        MAX(created_at) as last_sync,
        COUNT(*) as total_logs
      FROM provider_sync_log
      GROUP BY provider_name, entity_type
      ORDER BY entity_type, provider_name
    `);
    const rows = stmt.all() as Array<{ provider_name: string; entity_type: string; last_sync: string | null; total_logs: number }>;

    return rows.map(row => {
      const latest = this.db.prepare(`
        SELECT entity_count, status, error FROM provider_sync_log
        WHERE provider_name = ? AND entity_type = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(row.provider_name, row.entity_type) as { entity_count: number; status: string; error: string | null } | undefined;

      return {
        providerName: row.provider_name,
        entityType: row.entity_type,
        entityCount: latest?.entity_count ?? 0,
        lastSync: row.last_sync,
        lastStatus: latest?.status ?? 'unknown',
        lastError: latest?.error ?? null,
      };
    });
  }

  // ── Clone methods (registry → private) ─────────────────────────────

  cloneServer(name: string, version: string): ServerResponse | null {
    const original = this.getServer(name, version);
    if (!original) return null;
    if (original.source === 'private') return null;

    const clonedResponse = structuredClone(original);
    clonedResponse.source = 'private';
    clonedResponse.origin = 'private';
    delete (clonedResponse._meta as any)?.['com.mcp-registry-runtime.meta'];
    clonedResponse._meta = { ...clonedResponse._meta, 'com.mcp-registry-runtime.meta': {} };

    this.upsertServer(clonedResponse, 'private', '');
    return clonedResponse;
  }

  cloneSkill(name: string, version: string): SkillResponse | null {
    const stmt = this.db.prepare<[string, string], StoredSkill>(`
      SELECT * FROM skills WHERE name = ? AND version = ?
    `);
    const row = stmt.get(name, version);
    if (!row) return null;
    if (row.source === 'private') return null;

    const data = JSON.parse(row.data) as SkillResponse;
    const clonedResponse = structuredClone(data);
    clonedResponse.source = 'private';
    delete (clonedResponse._meta as any)?.['com.mcp-registry-runtime.meta'];
    clonedResponse._meta = { ...clonedResponse._meta, 'com.mcp-registry-runtime.meta': {} };

    this.upsertSkill(clonedResponse, 'private', '');
    return clonedResponse;
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

  private extractSkillRegistryMeta(skillResponse: SkillResponse): RegistryMeta | null {
    const meta = skillResponse._meta?.[REGISTRY_META_NAMESPACE] as RegistryMeta | undefined;
    return meta ?? null;
  }

  upsertSkill(skillResponse: SkillResponse, source: SkillSource, providerName: string): void {
    const skill = skillResponse.skill;
    const registryMeta = this.extractSkillRegistryMeta(skillResponse);

    const stmt = this.db.prepare(`
      INSERT INTO skills (name, version, source, data, format, category, tags, verified, featured, provider_name, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(name, version, provider_name) DO UPDATE SET
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
      registryMeta?.category ?? skill.category ?? null,
      registryMeta?.tags?.join(',') ?? skill.tags?.join(',') ?? null,
      registryMeta?.verified ? 1 : 0,
      registryMeta?.featured ? 1 : 0,
      providerName,
    );
  }

  bulkUpsertSkills(skills: SkillResponse[], providerName: string): void {
    console.log(`[Database] Bulk upserting ${skills.length} skills from ${providerName}...`);
    const transaction = this.db.transaction((items: SkillResponse[]) => {
      for (const skill of items) {
        try {
          this.upsertSkill(skill, 'registry', providerName);
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
      ORDER BY CASE provider_name
        WHEN 'skills.sh' THEN 0
        WHEN 'official-skills' THEN 1
        WHEN 'smithery-skills' THEN 2
        ELSE 3
      END
      LIMIT 1
    `);
    const row = stmt.get(name, version);
    if (!row) return null;
    const data = JSON.parse(row.data) as SkillResponse;
    return { ...data, source: row.source as SkillSource, provider_name: row.provider_name };
  }

  getLatestSkill(name: string): SkillResponse | null {
    const stmt = this.db.prepare<[string], StoredSkill>(`
      SELECT * FROM skills WHERE name = ?
      ORDER BY CASE provider_name
        WHEN 'skills.sh' THEN 0
        WHEN 'official-skills' THEN 1
        WHEN 'smithery-skills' THEN 2
        ELSE 3
      END,
      updated_at DESC
      LIMIT 1
    `);
    const row = stmt.get(name);
    if (!row) return null;
    const data = JSON.parse(row.data) as SkillResponse;
    return { ...data, source: row.source as SkillSource, provider_name: row.provider_name };
  }

  getSkillVersions(name: string): SkillResponse[] {
    const stmt = this.db.prepare<[string], StoredSkill & { rn: number }>(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY version ORDER BY
          CASE provider_name
            WHEN 'skills.sh' THEN 0
            WHEN 'official-skills' THEN 1
            WHEN 'smithery-skills' THEN 2
            ELSE 3
          END,
          updated_at DESC
        ) as rn
        FROM skills
        WHERE name = ?
      ) WHERE rn = 1
      ORDER BY updated_at DESC
    `);
    const rows = stmt.all(name);
    return rows.map(row => {
      const data = JSON.parse(row.data) as SkillResponse;
      return { ...data, source: row.source as SkillSource, provider_name: row.provider_name };
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

    if (query.provider_name) {
      conditions.push('provider_name = ?');
      params.push(query.provider_name);
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

    const providerOrder = `
      CASE provider_name
        WHEN 'skills.sh' THEN 0
        WHEN 'official-skills' THEN 1
        WHEN 'smithery-skills' THEN 2
        ELSE 3
      END
    `;

    const countStmt = this.db.prepare<(string | number)[], { count: number }>(`
      SELECT COUNT(*) as count FROM (
        SELECT name, version, ROW_NUMBER() OVER (PARTITION BY name, version ORDER BY ${providerOrder}, updated_at DESC) as rn
        FROM skills ${whereClause}
      ) WHERE rn = 1
    `);
    const { count: total } = countStmt.get(...params) ?? { count: 0 };

    const stmt = this.db.prepare<(string | number)[], StoredSkill & { rn: number }>(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY name, version ORDER BY ${providerOrder}, updated_at DESC) as rn
        FROM skills ${whereClause}
      ) WHERE rn = 1
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(...params, limit, offset);

    return {
      skills: rows.map(row => {
        const skillResponse = JSON.parse(row.data) as SkillResponse;
        return { ...skillResponse, source: row.source as SkillSource, provider_name: row.provider_name };
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

  // ────────────────────────────── Close ──────────────────────────────

  close(): void {
    this.db.close();
  }
}

export const databaseService = new DatabaseService();
