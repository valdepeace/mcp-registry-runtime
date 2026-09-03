/**
 * MCP Registry Types
 *
 * Core types re-exported from the shared @mcp/types package.
 * Frontend-specific types and UI constants are defined locally.
 */

import type {
  TransportType,
  ServerSource,
  ServerCategory,
  RuntimeStatus,
  RuntimeInstance,
  ServerResponse,
  SkillDetail,
  SkillResponse,
  SkillSource,
  SkillCategory,
  SkillFormat,
} from '@mcp/types';

import { REGISTRY_META_NAMESPACE } from '@mcp/types';

// ── Re-exports from shared types package ────────────────────────────────────

export type {
  TransportType,
  ServerSource,
  ServerCategory,
  RegistryMeta,
  StdioTransport,
  StreamableHttpTransport,
  SseTransport,
  LocalTransport,
  RemoteTransport,
  Input,
  KeyValueInput,
  Argument,
  Repository,
  Icon,
  Package,
  ServerDetail,
  ServerResponse,
  RuntimeStatus,
  RuntimeInstance,
  CreateRuntimeInstanceInput,
  UpdateRuntimeInstanceInput,
  SkillDetail,
  SkillResponse,
  SkillSource,
  SkillCategory,
  SkillFormat,
} from '@mcp/types';

export { REGISTRY_META_NAMESPACE } from '@mcp/types';

// ── Frontend-specific constants ─────────────────────────────────────────────

export const SERVER_CATEGORIES: { value: ServerCategory; label: string }[] = [
  { value: 'ai', label: 'AI & ML' },
  { value: 'data', label: 'Data & Databases' },
  { value: 'development', label: 'Development' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'integration', label: 'Integration' },
  { value: 'security', label: 'Security' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'other', label: 'Other' },
];

export const SKILL_CATEGORIES: { value: SkillCategory; label: string }[] = [
  { value: 'ai', label: 'AI & ML' },
  { value: 'data', label: 'Data & Databases' },
  { value: 'development', label: 'Development' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'integration', label: 'Integration' },
  { value: 'security', label: 'Security' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'frontend', label: 'Frontend' },
  { value: 'backend', label: 'Backend' },
  { value: 'devops', label: 'DevOps' },
  { value: 'other', label: 'Other' },
];

export const SKILL_FORMATS: { value: SkillFormat; label: string }[] = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
];

// ── Frontend-specific types ─────────────────────────────────────────────────

/**
 * Flattened metadata from the official registry (kept local for explicit typing
 * since the shared ServerResponse uses a catch-all index signature).
 */
export interface OfficialMeta {
  status?: 'active' | 'deprecated' | 'deleted';
  publishedAt?: string;
  updatedAt?: string;
  isLatest?: boolean;
}

/**
 * Private registry metadata (accessed from ServerResponse._meta catch-all).
 * The shared ServerResponse._meta uses `[key: string]: unknown`, so this
 * provides explicit typing for the private-server metadata key.
 */
export interface PrivateMeta {
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

/** Flattened server for list display. */
export interface ServerListItem {
  name: string;
  description: string;
  version: string;
  source?: ServerSource;
  version_detail?: {
    runtimeHint?: string;
    registryType?: string;
  };
}

/** Frontend list query params — extends the shared schema with UI filters. */
export interface ListServersParams {
  cursor?: string;
  limit?: number;
  search?: string;
  transport_type?: TransportType;
  source?: ServerSource | 'all';
  origin?: string;
  version?: string;
  category?: ServerCategory;
  tags?: string;
  verified?: boolean;
  featured?: boolean;
  vendor_official?: boolean;
}

/**
 * Frontend ServerListResponse — extends the shared type with `total` field
 * returned by the backend's admin endpoints.
 */
export interface ServerListResponse {
  servers: ServerResponse[];
  metadata?: {
    nextCursor?: string;
    count?: number;
    total?: number;
  };
}

// ── Auth types ──────────────────────────────────────────────────────────────

export interface RegistryStats {
  servers: {
    total: number;
    registry: number;
    private: number;
    byTransport: Record<string, number>;
  };
  skills: {
    total: number;
    registry: number;
    private: number;
  };
  syncStatus: {
    lastSync: string | null;
    status: string;
    error: string | null;
    isSyncing: boolean;
  };
}

export interface LoginResponse {
  token: string;
  expiresIn: string;
}

export interface User {
  id: number;
  username: string;
  role: string;
}

// ── Health / Inspector types ────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export interface McpPropertySchema {
  type?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  items?: McpPropertySchema;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, McpPropertySchema>;
    required?: string[];
  };
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface McpCapabilities {
  tools: McpTool[];
  resources: McpResource[];
  prompts: McpPrompt[];
}

export interface McpToolResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

export interface InspectHistoryEntry {
  id: number;
  tool_name: string;
  args_json: string;
  result_json: string | null;
  status: 'success' | 'error';
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface McpResourceContents {
  contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }>;
}

export interface McpPromptResult {
  description?: string;
  messages: Array<{ role: string; content: { type: string; text?: string } }>;
}

// ── Runtime metric/response types ───────────────────────────────────────────

export interface RuntimeMetrics {
  id: string;
  server_name: string;
  version: string;
  pm2_name: string;
  status: RuntimeStatus;
  pid?: number;
  uptime_ms?: number;
  restart_count?: number;
  memory?: number;
  cpu?: number;
}

export interface RuntimeMetricsResponse {
  metrics: RuntimeMetrics[];
}

export interface RuntimeListResponse {
  instances: RuntimeInstance[];
}

export interface DetectedRuntimeConfig {
  exec_cmd: string;
  exec_args: string[];
  env_json: Record<string, string>;
  cwd?: string;
  port?: number;
  /** Present when the MCP has no package: it is cloned and built from source. */
  provision?: { repository: string; subfolder?: string };
}

export interface RuntimeInstanceResponse {
  instance: RuntimeInstance;
}

export interface RuntimeLogsResponse {
  logs: string;
}

// ── Skills list types ─────────────────────────────────────────────────

export interface SkillListResponse {
  skills: SkillResponse[];
  metadata?: {
    nextCursor?: string;
    count?: number;
    total?: number;
  };
}

export interface SkillListParams {
  cursor?: string;
  limit?: number;
  search?: string;
  category?: SkillCategory;
  tags?: string;
  verified?: boolean;
  featured?: boolean;
  format?: SkillFormat;
  source?: SkillSource | 'all';
  provider_name?: string;
}


// A2A gateway

export interface A2AApiKey {
  id: string;
  label: string;
  key_prefix: string;
  requests_per_min: number;
  created_at: string;
  revoked_at: string | null;
}

export interface A2ARequestLog {
  id: string;
  key_id: string;
  key_label: string;
  skill: string;
  status: 'completed' | 'failed' | 'input-required' | 'working';
  input_json: string | null;
  result_json: string | null;
  error: string | null;
  instance_id: string | null;
  created_at: string;
  updated_at: string;
}

/** One column of a DataTable. `value` feeds both the cell text and the sorting. */
export interface TableColumn<Row> {
  key: string;
  label: string;
  value: (row: Row) => string | number | null | undefined;
  /** Render the cell as a link to this href. */
  link?: (row: Row) => string;
  /** Render the cell as a Chip of this variant. */
  badge?: (row: Row) => 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
  align?: 'left' | 'right';
  mono?: boolean;
  sortable?: boolean;
}
