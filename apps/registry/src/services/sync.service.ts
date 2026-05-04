import { officialRegistryService } from './official-registry.service.js';
import { skillsRegistryService } from './skills-registry.service.js';
import { agentsRegistryService } from './agents-registry.service.js';
import { databaseService } from './database.service.js';
import { config } from '../config/index.js';

export class SyncService {
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;

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

      const [servers, skills, agents] = await Promise.all([
        this.syncServers(),
        this.syncSkills(),
        this.syncAgents(),
      ]);

      const elapsed = Date.now() - startTime;
      console.log(`[Sync] Completed. Servers: ${servers}, Skills: ${skills}, Agents: ${agents} (${elapsed}ms)`);

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

  private async syncServers(): Promise<number> {
    console.log('[Sync] Starting servers sync...');
    const servers = await officialRegistryService.fetchAllServers();
    databaseService.bulkUpsertFromOfficial(servers);
    console.log(`[Sync] Servers: ${servers.length}`);
    return servers.length;
  }

  private async syncSkills(): Promise<number> {
    if (!skillsRegistryService.isConfigured) {
      console.log('[Sync] Skills registry not configured');
      return 0;
    }
    console.log('[Sync] Starting skills sync...');
    const skills = await skillsRegistryService.fetchAllSkills();
    databaseService.bulkUpsertSkills(skills);
    console.log(`[Sync] Skills: ${skills.length}`);
    return skills.length;
  }

  private async syncAgents(): Promise<number> {
    if (!agentsRegistryService.isConfigured) {
      console.log('[Sync] Agents registry not configured');
      return 0;
    }
    console.log('[Sync] Starting agents sync...');
    const agents = await agentsRegistryService.fetchAllAgents();
    databaseService.bulkUpsertAgents(agents);
    console.log(`[Sync] Agents: ${agents.length}`);
    return agents.length;
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

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[Sync] Stopped periodic sync');
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): { lastSync: string | null; status: string; error: string | null; isSyncing: boolean } {
    const dbStatus = databaseService.getSyncStatus();
    return {
      ...dbStatus,
      isSyncing: this.isSyncing,
    };
  }
}

export const syncService = new SyncService();
