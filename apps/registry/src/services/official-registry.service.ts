import type { ServerListResponse, ServerResponse, ListServersParams } from '@mcp/types';
import { ServerListResponseSchema } from '@mcp/types';
import { config } from '../config/index.js';
import { SmitheryServersProvider, type ServersProvider } from './providers/index.js';

/**
 * Service to interact with the official MCP registry and additional server providers.
 */
export class OfficialRegistryService {
  private baseUrl: string;
  private extraProviders: ServersProvider[];

  constructor() {
    this.baseUrl = config.officialRegistryUrl;
    this.extraProviders = [];
    this.initProviders();
  }

  private initProviders(): void {
    this.extraProviders.push(new SmitheryServersProvider());
  }

  get isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  get providerNames(): string[] {
    const names = ['mcp-official'];
    for (const p of this.extraProviders) names.push(p.name);
    return names;
  }

  /**
   * Fetch all servers from the official MCP registry with pagination.
   */
  async fetchAllServers(onProgress?: (msg: string, current?: number, total?: number) => void): Promise<ServerResponse[]> {
    const allServers: ServerResponse[] = [];
    let cursor: string | undefined;
    let page = 0;

    do {
      page++;
      onProgress?.(`Fetching page ${page}...`, page);
      console.log(`[OfficialRegistry] Fetching page ${page}${cursor ? ` (cursor: ${cursor})` : ''}`);
      const response = await this.listServers({ cursor, limit: 100 });
      console.log(`[OfficialRegistry] Page ${page}: ${response.servers.length} servers`);
      allServers.push(...response.servers);
      cursor = response.metadata?.nextCursor;
    } while (cursor);

    console.log(`[OfficialRegistry] Total fetched from official: ${allServers.length} servers`);
    return allServers;
  }

  /**
   * Fetch servers from all additional providers (Smithery, etc.).
   * Returns results per provider for audit/logging.
   */
  async fetchAllFromProviders(onProgress?: (msg: string, current?: number, total?: number) => void): Promise<{ servers: ServerResponse[]; results: Array<{ provider: string; count: number; error?: string }> }> {
    const allServers: ServerResponse[] = [];
    const results: Array<{ provider: string; count: number; error?: string }> = [];

    for (const provider of this.extraProviders) {
      try {
        console.log(`[OfficialRegistry] Fetching from provider: ${provider.name}`);
        const servers = await provider.fetchAllServers(onProgress);
        allServers.push(...servers);
        results.push({ provider: provider.name, count: servers.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[OfficialRegistry] Provider ${provider.name} failed:`, msg);
        results.push({ provider: provider.name, count: 0, error: msg });
      }
    }

    return { servers: allServers, results };
  }

  /**
   * List servers with optional filters
   */
  async listServers(params: ListServersParams = {}): Promise<ReturnType<typeof ServerListResponseSchema.parse>> {
    const url = new URL('/v0.1/servers', this.baseUrl);

    if (params.cursor) url.searchParams.set('cursor', params.cursor);
    if (params.limit) url.searchParams.set('limit', params.limit.toString());
    if (params.search) url.searchParams.set('search', params.search);
    if (params.updated_since) url.searchParams.set('updated_since', params.updated_since);
    if (params.version) url.searchParams.set('version', params.version);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[OfficialRegistry] HTTP ${response.status}: ${response.statusText}`);
      console.error(`[OfficialRegistry] Response body: ${body}`);
      throw new Error(`Failed to fetch servers: ${response.status} ${response.statusText}`);
    }

    const data: unknown = await response.json();
    return ServerListResponseSchema.parse(data);
  }

  /**
   * Get all versions of a server
   */
  async getServerVersions(serverName: string): Promise<ServerListResponse> {
    const encodedName = encodeURIComponent(serverName);
    const url = new URL(`/v0.1/servers/${encodedName}/versions`, this.baseUrl);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { servers: [] };
      }
      throw new Error(`Failed to fetch server versions: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<ServerListResponse>;
  }

  /**
   * Get a specific version of a server
   */
  async getServerVersion(serverName: string, version: string): Promise<ServerResponse | null> {
    const encodedName = encodeURIComponent(serverName);
    const encodedVersion = encodeURIComponent(version);
    const url = new URL(`/v0.1/servers/${encodedName}/versions/${encodedVersion}`, this.baseUrl);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch server: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<ServerResponse>;
  }
}

export const officialRegistryService = new OfficialRegistryService();
