/**
 * Servers provider for Smithery.ai marketplace.
 *
 * API: https://api.smithery.ai/servers (no auth required)
 *
 * Maps Smithery's server format to the MCP registry ServerResponse format.
 * Since Smithery provides less detail than the official MCP registry (no packages,
 * transport types, etc.), we map what's available and mark source accordingly.
 */
import type { ServerResponse } from '@mcp/types';
import type { ServersProvider } from './types.js';
import { config } from '../../config/index.js';

interface SmitheryServer {
  id: string;
  qualifiedName: string;
  namespace: string;
  displayName: string;
  description: string;
  iconUrl: string;
  verified: boolean;
  useCount: number;
  remote: boolean;
  isDeployed: boolean;
  createdAt: string;
  homepage: string;
}

interface SmitheryPaginated<T> {
  servers: T[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  };
}

export class SmitheryServersProvider implements ServersProvider {
  readonly name = 'smithery-servers';
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.smitheryApiUrl ?? 'https://api.smithery.ai';
  }

  isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  async fetchAllServers(onProgress?: (msg: string, current?: number, total?: number) => void): Promise<ServerResponse[]> {
    console.log('[SmitheryServers] Fetching server listing...');
    const allServers: SmitheryServer[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const url = new URL('/servers', this.baseUrl);
      url.searchParams.set('page', String(page));
      url.searchParams.set('pageSize', '100');

      onProgress?.(`Fetching page ${page}...`, page, totalPages);

      const response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        console.error(`[SmitheryServers] HTTP ${response.status} on page ${page}`);
        break;
      }

      const data = await response.json() as SmitheryPaginated<SmitheryServer>;
      allServers.push(...(data?.servers ?? []));
      totalPages = data?.pagination?.totalPages ?? 1;
      page++;
    } while (page <= totalPages);

    onProgress?.(`Mapping ${allServers.length} servers...`, allServers.length, allServers.length);
    const result = allServers.map(s => this.mapToServerResponse(s));
    return result;
  }

  private mapToServerResponse(s: SmitheryServer): ServerResponse {
    const normalizedName = s.qualifiedName.includes('/')
      ? s.qualifiedName
      : `smithery/${s.qualifiedName}`;

    return {
      server: {
        name: normalizedName,
        title: s.displayName,
        description: s.description,
        version: '1.0.0',
        websiteUrl: s.homepage || undefined,
        icons: s.iconUrl ? [{ src: s.iconUrl, sizes: ['48x48'] }] : undefined,
      },
      source: 'registry',
      _meta: {
        'com.mcp-registry-runtime.meta': {
          verified: s.verified,
          featured: false,
          vendorOfficial: false,
        },
        'smithery': {
          remote: s.remote,
          useCount: s.useCount,
          createdAt: s.createdAt,
        },
      },
    };
  }
}
