import type { ServerResponse, SkillResponse } from '@mcp/types';

export type ProgressCallback = (message: string, current?: number, total?: number) => void;

export interface ServersProvider {
  name: string;
  fetchAllServers(onProgress?: ProgressCallback): Promise<ServerResponse[]>;
  isConfigured(): boolean;
}

export interface SkillsProvider {
  name: string;
  fetchAllSkills(onProgress?: ProgressCallback): Promise<SkillResponse[]>;
  isConfigured(): boolean;
}

export interface ProviderSyncResult {
  provider: string;
  entityType: 'servers' | 'skills';
  count: number;
  error?: string;
}
