import { officialRegistryService } from './official-registry.service.js';
import { skillsRegistryService } from './skills-registry.service.js';
import { agentsRegistryService } from './agents-registry.service.js';
import { databaseService } from './database.service.js';
import { config } from '../config/index.js';
import type { ProviderSyncResult } from './providers/types.js';
import { syncEventBus } from './sync-event-bus.js';

export class SyncService {
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private syncingTypes = new Set<'servers' | 'skills' | 'agents'>();

  async sync(): Promise<void> {
    if (this.isSyncing) {
      console.log('[Sync] Already syncing, skipping...');
      return;
    }

    this.isSyncing = true;
    databaseService.updateSyncStatus('syncing');

    try {
      console.log('[Sync] Starting full sync...');
      const startTime = Date.now();

      const [serversResult, skillsResult, agentsResult] = await Promise.all([
        this.syncServers(),
        this.syncSkills(),
        this.syncAgents(),
      ]);

      const elapsed = Date.now() - startTime;

      const parts: string[] = [];
      if (serversResult) {
        parts.push(`Servers: ${serversResult.servers} (${serversResult.providers})`);
      }
      if (skillsResult) {
        parts.push(`Skills: ${skillsResult.skills} (${skillsResult.providers})`);
      }
      if (agentsResult !== null) {
        parts.push(`Agents: ${agentsResult}`);
      }

      console.log(`[Sync] Completed. ${parts.join(', ')} (${elapsed}ms)`);
      databaseService.updateSyncStatus('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : '';
      console.error('[Sync] Failed:', message);
      console.error('[Sync] Stack:', stack);
      databaseService.updateSyncStatus('error', message);
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncServers(): Promise<{ servers: number; providers: string } | null> {
    console.log('[Sync] Starting servers sync...');
    const allServers: any[] = [];
    const providerResults: ProviderSyncResult[] = [];

    await this.runProviderSync('servers', 'mcp-official', async () => {
      const onProgress = this.makeProgress('mcp-official', 'servers');
      const official = await officialRegistryService.fetchAllServers(onProgress);
      databaseService.bulkUpsertFromOfficial(official, 'mcp-official');
      allServers.push(...official);
      providerResults.push({ provider: 'mcp-official', entityType: 'servers', count: official.length });
      return official.length;
    });

    try {
      const onProgress = this.makeProgress('smithery-servers', 'servers');
      syncEventBus.emitSync({ type: 'provider:start', providerName: 'smithery-servers', entityType: 'servers', timestamp: new Date().toISOString() });

      const { servers: extraServers, results } = await officialRegistryService.fetchAllFromProviders(onProgress);
      if (extraServers.length > 0) {
        databaseService.bulkUpsertFromOfficial(extraServers, 'smithery-servers');
        allServers.push(...extraServers);
      }
      for (const r of results) {
        providerResults.push({ provider: r.provider, entityType: 'servers', count: r.count, error: r.error });
        databaseService.logProviderSync(r.provider, 'servers', r.count, r.error ? 'error' : 'success', r.error);
        syncEventBus.emitSync({
          type: r.error ? 'provider:error' : 'provider:complete',
          providerName: r.provider,
          entityType: 'servers',
          timestamp: new Date().toISOString(),
          count: r.count,
          error: r.error,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Sync] Extra servers providers failed:', err);
      syncEventBus.emitSync({ type: 'provider:error', providerName: 'smithery-servers', entityType: 'servers', timestamp: new Date().toISOString(), error: msg });
    }

    const providersStr = providerResults
      .map(r => `${r.provider}(${r.count}${r.error ? ' err' : ''})`)
      .join(', ');

    console.log(`[Sync] Servers: ${allServers.length} total from ${providerResults.length} providers`);
    return { servers: allServers.length, providers: providersStr };
  }

  private async syncSkills(): Promise<{ skills: number; providers: string } | null> {
    if (!skillsRegistryService.isConfigured) {
      console.log('[Sync] Skills registry not configured');
      return null;
    }
    console.log('[Sync] Starting skills sync...');
    const onProgress = this.makeProgress('skills', 'skills');
    const perProviderResults = await skillsRegistryService.fetchAllSkills(onProgress);

    let totalSkills = 0;
    const results: Array<{ provider: string; count: number; error?: string }> = [];

    for (const pr of perProviderResults) {
      if (pr.skills.length > 0) {
        databaseService.bulkUpsertSkills(pr.skills, pr.provider);
        totalSkills += pr.skills.length;
      }
      databaseService.logProviderSync(pr.provider, 'skills', pr.skills.length, pr.error ? 'error' : 'success', pr.error);
      results.push({ provider: pr.provider, count: pr.skills.length, error: pr.error });
    }

    const providersStr = results
      .map(r => `${r.provider}(${r.count}${r.error ? ' err' : ''})`)
      .join(', ');

    console.log(`[Sync] Skills: ${totalSkills} from ${results.length} providers`);
    return { skills: totalSkills, providers: providersStr };
  }

  private async syncAgents(): Promise<number | null> {
    if (!agentsRegistryService.isConfigured) {
      console.log('[Sync] Agents registry not configured');
      return null;
    }
    console.log('[Sync] Starting agents sync...');
    const agents = await agentsRegistryService.fetchAllAgents();
    databaseService.bulkUpsertAgents(agents);

    databaseService.logProviderSync('agents-registry', 'agents', agents.length, 'success');

    console.log(`[Sync] Agents: ${agents.length}`);
    return agents.length;
  }

  private makeProgress(providerName: string, entityType: 'servers' | 'skills' | 'agents') {
    return (message: string, current?: number, total?: number) => {
      syncEventBus.emitSync({
        type: 'provider:progress',
        providerName,
        entityType,
        timestamp: new Date().toISOString(),
        message,
        current,
        total,
      });
    };
  }
  private async runProviderSync(
    entityType: 'servers' | 'skills' | 'agents',
    providerName: string,
    fn: () => Promise<number>,
  ): Promise<void> {
    syncEventBus.emitSync({
      type: 'provider:start',
      providerName,
      entityType,
      timestamp: new Date().toISOString(),
    });

    try {
      const count = await fn();
      databaseService.logProviderSync(providerName, entityType, count, 'success');
      syncEventBus.emitSync({
        type: 'provider:complete',
        providerName,
        entityType,
        timestamp: new Date().toISOString(),
        count,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[Sync] Provider ${providerName} failed:`, msg);
      databaseService.logProviderSync(providerName, entityType, 0, 'error', msg);
      syncEventBus.emitSync({
        type: 'provider:error',
        providerName,
        entityType,
        timestamp: new Date().toISOString(),
        error: msg,
      });
    }
  }

  async syncByType(type: 'servers' | 'skills' | 'agents'): Promise<void> {
    if (this.syncingTypes.has(type)) {
      console.log(`[Sync] Already syncing ${type}, skipping...`);
      return;
    }

    this.syncingTypes.add(type);
    console.log(`[Sync] Starting ${type} sync...`);

    try {
      switch (type) {
        case 'servers':
          await this.syncServers();
          break;
        case 'skills':
          await this.syncSkills();
          break;
        case 'agents':
          await this.syncAgents();
          break;
      }
      databaseService.updateSyncStatus('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      databaseService.updateSyncStatus('error', msg);
    } finally {
      this.syncingTypes.delete(type);
    }
  }

  async syncProvider(type: 'servers' | 'skills' | 'agents', providerName: string): Promise<void> {
    console.log(`[Sync] Starting provider sync: ${providerName} (${type})...`);

    if (type === 'servers') {
      if (providerName === 'mcp-official') {
        await this.runProviderSync('servers', 'mcp-official', async () => {
          const official = await officialRegistryService.fetchAllServers();
          databaseService.bulkUpsertFromOfficial(official, 'mcp-official');
          return official.length;
        });
      } else {
        // Extra provider (Smithery servers)
        syncEventBus.emitSync({ type: 'provider:start', providerName, entityType: 'servers', timestamp: new Date().toISOString() });
        const onProgress = this.makeProgress(providerName, 'servers');
        const { servers, results } = await officialRegistryService.fetchAllFromProviders(onProgress);
        for (const r of results) {
          if (r.provider === providerName) {
            databaseService.logProviderSync(r.provider, 'servers', r.count, r.error ? 'error' : 'success', r.error);
            syncEventBus.emitSync({
              type: r.error ? 'provider:error' : 'provider:complete',
              providerName: r.provider,
              entityType: 'servers',
              timestamp: new Date().toISOString(),
              count: r.count,
              error: r.error,
            });
            if (servers.length > 0) databaseService.bulkUpsertFromOfficial(servers, providerName);
          }
        }
      }
    } else if (type === 'skills') {
      const provider = skillsRegistryService.getProvider(providerName);
      if (!provider) {
        console.log(`[Sync] Skills provider not found: ${providerName}`);
        return;
      }
      const onProgress = this.makeProgress(providerName, 'skills');
      await this.runProviderSync('skills', providerName, async () => {
        const skills = await provider.fetchAllSkills(onProgress);
        if (skills.length > 0) {
          databaseService.bulkUpsertSkills(skills, providerName);
        }
        return skills.length;
      });
    } else if (type === 'agents') {
      await this.syncAgents();
    }
  }

  getProviders(): Array<{
    providerName: string;
    entityType: string;
    entityCount: number;
    lastSync: string | null;
    lastStatus: string;
    lastError: string | null;
    configured: boolean;
  }> {
    const stats = databaseService.getProviderSyncStats();
    const statsMap = new Map<string, typeof stats[0]>();
    for (const s of stats) {
      statsMap.set(`${s.providerName}:${s.entityType}`, s);
    }

    const allProviders: Array<{
      providerName: string;
      entityType: string;
      entityCount: number;
      lastSync: string | null;
      lastStatus: string;
      lastError: string | null;
      configured: boolean;
    }> = [];

    for (const name of officialRegistryService.providerNames) {
      const entityType = name === 'mcp-official' ? 'servers' : 'servers';
      const stat = statsMap.get(`${name}:${entityType}`);
      allProviders.push({
        providerName: name,
        entityType,
        entityCount: stat?.entityCount ?? 0,
        lastSync: stat?.lastSync ?? null,
        lastStatus: stat?.lastStatus ?? 'pending',
        lastError: stat?.lastError ?? null,
        configured: true,
      });
    }

    for (const name of skillsRegistryService.providerNames) {
      const stat = statsMap.get(`${name}:skills`);
      allProviders.push({
        providerName: name,
        entityType: 'skills',
        entityCount: stat?.entityCount ?? 0,
        lastSync: stat?.lastSync ?? null,
        lastStatus: stat?.lastStatus ?? 'pending',
        lastError: stat?.lastError ?? null,
        configured: true,
      });
    }

    if (agentsRegistryService.isConfigured) {
      const name = 'agents-registry';
      const stat = statsMap.get(`${name}:agents`);
      allProviders.push({
        providerName: name,
        entityType: 'agents',
        entityCount: stat?.entityCount ?? 0,
        lastSync: stat?.lastSync ?? null,
        lastStatus: stat?.lastStatus ?? 'pending',
        lastError: stat?.lastError ?? null,
        configured: true,
      });
    }

    return allProviders;
  }

  startPeriodicSync(): void {
    if (this.syncInterval) {
      return;
    }

    if (config.syncIntervalMs <= 0) {
      console.log('[Sync] Periodic sync disabled (interval = 0)');
      return;
    }

    console.log(`[Sync] Starting periodic sync every ${config.syncIntervalMs / 1000}s`);
    this.syncInterval = setInterval(() => this.sync(), config.syncIntervalMs);
  }

  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[Sync] Stopped periodic sync');
    }
  }

  getStatus(): { lastSync: string | null; status: string; error: string | null; isSyncing: boolean; syncingTypes: string[] } {
    const dbStatus = databaseService.getSyncStatus();
    return {
      ...dbStatus,
      isSyncing: this.isSyncing || this.syncingTypes.size > 0,
      syncingTypes: Array.from(this.syncingTypes),
    };
  }
}

export const syncService = new SyncService();
