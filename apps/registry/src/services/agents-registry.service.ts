import type { AgentListResponse, AgentResponse } from '@mcp/types';
import { AgentListResponseSchema } from '@mcp/types';
import { config } from '../config/index.js';

export class AgentsRegistryService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.officialAgentsRegistryUrl ?? '';
  }

  get isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  async fetchAllAgents(): Promise<AgentResponse[]> {
    if (!this.isConfigured) {
      console.log('[AgentsRegistry] No registry URL configured, skipping sync');
      return [];
    }

    const allAgents: AgentResponse[] = [];
    let cursor: string | undefined;
    let page = 0;

    do {
      page++;
      console.log(`[AgentsRegistry] Fetching page ${page}${cursor ? ` (cursor: ${cursor})` : ''}`);
      const response = await this.listAgents({ cursor, limit: 100 });
      console.log(`[AgentsRegistry] Page ${page}: ${response.agents.length} agents`);
      allAgents.push(...response.agents);
      cursor = response.metadata?.nextCursor;
    } while (cursor);

    console.log(`[AgentsRegistry] Total fetched: ${allAgents.length} agents`);
    return allAgents;
  }

  async listAgents(params: { cursor?: string; limit?: number } = {}): Promise<ReturnType<typeof AgentListResponseSchema.parse>> {
    const url = new URL('/v0.1/agents', this.baseUrl);

    if (params.cursor) url.searchParams.set('cursor', params.cursor);
    if (params.limit) url.searchParams.set('limit', params.limit.toString());

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[AgentsRegistry] HTTP ${response.status}: ${response.statusText}`);
      console.error(`[AgentsRegistry] Response body: ${body}`);
      throw new Error(`Failed to fetch agents: ${response.status} ${response.statusText}`);
    }

    const data: unknown = await response.json();
    return AgentListResponseSchema.parse(data);
  }
}

export const agentsRegistryService = new AgentsRegistryService();
