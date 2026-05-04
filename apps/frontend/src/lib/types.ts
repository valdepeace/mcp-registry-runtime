/**
 * MCP Registry Types
 *
 * Core types re-exported from the shared @mcp-nova/types package.
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
  AgentDetail,
  AgentResponse,
  AgentSource,
  AgentCategory,
  AgentType,
} from '@mcp-nova/types';

import { NOVA_META_NAMESPACE } from '@mcp-nova/types';

// ── Re-exports from shared types package ────────────────────────────────────

export type {
  TransportType,
  ServerSource,
  ServerCategory,
  NovaMeta,
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
  AgentDetail,
  AgentResponse,
  AgentSource,
  AgentCategory,
  AgentType,
} from '@mcp-nova/types';

export { NOVA_META_NAMESPACE } from '@mcp-nova/types';

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

export const AGENT_CATEGORIES: { value: AgentCategory; label: string }[] = [
  { value: 'ai', label: 'AI & ML' },
  { value: 'data', label: 'Data' },
  { value: 'development', label: 'Development' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'integration', label: 'Integration' },
  { value: 'security', label: 'Security' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'frontend', label: 'Frontend' },
  { value: 'backend', label: 'Backend' },
  { value: 'devops', label: 'DevOps' },
  { value: 'qa', label: 'QA' },
  { value: 'other', label: 'Other' },
];

export const AGENT_TYPES: { value: AgentType; label: string }[] = [
  { value: 'backend-engineer', label: 'Backend Engineer' },
  { value: 'frontend-engineer', label: 'Frontend Engineer' },
  { value: 'devops-engineer', label: 'DevOps Engineer' },
  { value: 'explore', label: 'Explorer' },
  { value: 'general', label: 'General' },
  { value: 'qa-back', label: 'QA Backend' },
  { value: 'qa-front', label: 'QA Frontend' },
  { value: 'custom', label: 'Custom' },
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
  agents: {
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

export interface RuntimeInstanceResponse {
  instance: RuntimeInstance;
}

export interface RuntimeLogsResponse {
  logs: string;
}

// ── Skills/Agents list types ─────────────────────────────────────────────────

export interface SkillListResponse {
  skills: SkillResponse[];
  metadata?: {
    nextCursor?: string;
    count?: number;
    total?: number;
  };
}

export interface AgentListResponse {
  agents: AgentResponse[];
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
}

export interface AgentListParams {
  cursor?: string;
  limit?: number;
  search?: string;
  category?: AgentCategory;
  tags?: string;
  verified?: boolean;
  featured?: boolean;
  subagent_type?: AgentType;
  source?: AgentSource | 'all';
}

// ── Agent Runtime types ──────────────────────────────────────────────────────

export interface AgentInstance {
  id: string;
  agent_name: string;
  agent_version: string;
  status: string;
  exec_cmd: string;
  exec_args: string | null;
  resolved_skills: string | null;
  resolved_mcp_instances: string | null;
  composed_prompt: string | null;
  pm2_name: string;
  pid: number | null;
  uptime_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface AgentInstanceListResponse {
  instances: AgentInstance[];
}

export interface AgentInstanceResponse {
  instance: AgentInstance;
}

export interface AgentComposeResponse {
  composed: {
    agent: AgentDetail;
    resolvedSkills: { name: string; version: string; content: string; format: string }[];
    resolvedMCPServers: { name: string; version: string }[];
    composedPrompt: string;
  };
}

export interface AgentInvokeResponse {
  instance: AgentInstance;
  output: string;
}

export interface AgentInvocation {
  id: number;
  instance_id: string;
  input: string;
  output: string | null;
  status: string;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}
