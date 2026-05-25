/**
 * MCP Server Registry Types
 * Based on OpenAPI spec: https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/openapi.yaml
 */

// Transport Types
export type TransportType = 'stdio' | 'streamable-http' | 'sse';

export interface StdioTransport {
  type: 'stdio';
}

export interface StreamableHttpTransport {
  type: 'streamable-http';
  url: string;
  headers?: KeyValueInput[];
}

export interface SseTransport {
  type: 'sse';
  url: string;
  headers?: KeyValueInput[];
}

export type LocalTransport = StdioTransport | StreamableHttpTransport | SseTransport;

export interface RemoteTransport extends Omit<StreamableHttpTransport | SseTransport, 'type'> {
  type: 'streamable-http' | 'sse';
  variables?: Record<string, Input>;
}

// Input Types
export interface Input {
  description?: string;
  isRequired?: boolean;
  format?: string;
  value?: string;
  isSecret?: boolean;
  default?: string;
  placeholder?: string;
  choices?: string[];
}

export interface InputWithVariables extends Input {
  variables?: Record<string, unknown>;
}

export interface KeyValueInput extends InputWithVariables {
  name: string;
}

export interface PositionalArgument extends InputWithVariables {
  type?: string;
  valueHint?: string;
  isRepeated?: boolean;
}

export interface NamedArgument extends InputWithVariables {
  type?: string;
  name?: string;
  isRepeated?: boolean;
}

export type Argument = {
  type?: string;
  name?: string;
  valueHint?: string;
  [key: string]: unknown;
};

// Repository
export interface Repository {
  url?: string;
  source?: string;
  id?: string;
  subfolder?: string;
}

// Icon
export interface Icon {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: string;
}

// Package
export interface Package {
  registryType: string; // npm, pypi, oci, nuget, mcpb
  registryBaseUrl?: string;
  identifier: string;
  version?: string;
  fileSha256?: string;
  runtimeHint?: string;
  transport: LocalTransport;
  runtimeArguments?: Argument[];
  packageArguments?: Argument[];
  environmentVariables?: KeyValueInput[];
}

// Server Detail
export interface ServerDetail {
  name: string;
  description: string;
  title?: string;
  origin?: string;
  repository?: Repository;
  version: string;
  websiteUrl?: string;
  icons?: Icon[];
  $schema?: string;
  packages?: Package[];
  remotes?: RemoteTransport[];
  _meta?: {
    'io.modelcontextprotocol.registry/publisher-provided'?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

// Server Response (API response with registry metadata)
export interface ServerResponse {
  server: ServerDetail;
  source?: ServerSource;
  origin?: string;
  provider_name?: string;
  _meta?: {
    'io.modelcontextprotocol.registry/official'?: {
      status?: 'active' | 'deprecated' | 'deleted';
      publishedAt?: string;
      updatedAt?: string;
      isLatest?: boolean;
    };
    [key: string]: unknown;
  };
}

// Server List Response
export interface ServerListResponse {
  servers: ServerResponse[];
  metadata?: {
    nextCursor?: string;
    count?: number;
  };
}

// Query Parameters for list endpoint
export interface ListServersParams {
  cursor?: string;
  limit?: number;
  search?: string;
  updated_since?: string;
  version?: string;
}

// Extended types for private registry
export type ServerSource = 'registry' | 'private' | 'azure-devops';

// Nova custom metadata namespace
export type ServerCategory = 
  | 'ai'
  | 'data'
  | 'development'
  | 'infrastructure'
  | 'integration'
  | 'security'
  | 'productivity'
  | 'other';

export interface NovaMeta {
  tags?: string[];
  category?: ServerCategory;
  verified?: boolean;
  featured?: boolean;
  license?: string;
  vendorOfficial?: boolean;
}

export const NOVA_META_NAMESPACE = 'com.mcp-nova.meta' as const;

export interface PrivateServerDetail extends ServerDetail {
  source: ServerSource;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  _meta?: {
    'io.modelcontextprotocol.registry/publisher-provided'?: Record<string, unknown>;
    'com.mcp-nova.meta'?: NovaMeta;
    [key: string]: unknown;
  };
}

export interface PrivateServerResponse extends ServerResponse {
  source: ServerSource;
}

// Filter by transport type
export interface TransportFilter {
  transportType?: TransportType | TransportType[];
  hasRemote?: boolean;
  hasPackage?: boolean;
}
