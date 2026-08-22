/**
 * Agent Registry Types
 * Agents are composable workers: Instructions + Skills + MCP Servers (tools).
 */

import type { RegistryMeta, Repository } from './mcp-registry.js';

export type AgentSource = 'registry' | 'private';

export type AgentCategory =
  | 'ai'
  | 'data'
  | 'development'
  | 'infrastructure'
  | 'integration'
  | 'security'
  | 'productivity'
  | 'frontend'
  | 'backend'
  | 'devops'
  | 'qa'
  | 'other';

export interface SkillRef {
  name: string;
  version: string;
}

export interface MCPServerRef {
  name: string;
  version: string;
}

export type AgentType =
  | 'backend-engineer'
  | 'frontend-engineer'
  | 'devops-engineer'
  | 'explore'
  | 'general'
  | 'qa-back'
  | 'qa-front'
  | 'custom';

export interface AgentDetail {
  name: string;
  description: string;
  title?: string;
  version: string;
  instructions: string;
  required_skills: SkillRef[];
  required_mcp_servers: MCPServerRef[];
  subagent_type: AgentType;
  tool_access?: string[];
  category?: AgentCategory;
  tags?: string[];
  websiteUrl?: string;
  repository?: Repository;
  _meta?: {
    'com.mcp-registry-runtime.meta'?: RegistryMeta;
    [key: string]: unknown;
  };
}

export interface AgentResponse {
  agent: AgentDetail;
  source?: AgentSource;
  _meta?: Record<string, unknown>;
}

export interface AgentListResponse {
  agents: AgentResponse[];
  metadata?: {
    nextCursor?: string;
    count?: number;
  };
}

export interface ListAgentsParams {
  cursor?: string;
  limit?: number;
  search?: string;
  updated_since?: string;
  version?: string;
  category?: AgentCategory;
  tags?: string;
  verified?: boolean;
  featured?: boolean;
  subagent_type?: AgentType;
  source?: AgentSource | 'all';
}
