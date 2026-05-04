import type { ServerListResponse, ServerResponse, ListServersParams } from '@mcp-nova/types';
import { ServerListResponseSchema } from '@mcp-nova/types';
import { config } from '../config/index.js';

/**
 * Service to interact with the official MCP registry
 */
export class OfficialRegistryService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.officialRegistryUrl;
  }

  /**
   * Fetch all servers from official registry with pagination
   */
  async fetchAllServers(): Promise<ServerResponse[]> {
    const allServers: ServerResponse[] = [];
    let cursor: string | undefined;
    let page = 0;

    do {
      page++;
      console.log(`[OfficialRegistry] Fetching page ${page}${cursor ? ` (cursor: ${cursor})` : ''}`);
      const response = await this.listServers({ cursor, limit: 100 });
      console.log(`[OfficialRegistry] Page ${page}: ${response.servers.length} servers`);
      allServers.push(...response.servers);
      cursor = response.metadata?.nextCursor;
    } while (cursor);

    console.log(`[OfficialRegistry] Total fetched: ${allServers.length} servers`);
    return allServers;
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
