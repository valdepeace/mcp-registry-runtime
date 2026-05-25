import type { ServerResponse, SkillResponse, AgentResponse } from '@mcp-nova/types';

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

export interface AgentsProvider {
  name: string;
  fetchAllAgents(onProgress?: ProgressCallback): Promise<AgentResponse[]>;
  isConfigured(): boolean;
}

export interface ProviderSyncResult {
  provider: string;
  entityType: 'servers' | 'skills' | 'agents';
  count: number;
  error?: string;
}
