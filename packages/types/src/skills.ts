/**
 * Skill Registry Types
 * Skills are reusable knowledge packs (patterns, workflows, instructions).
 */

import type { NovaMeta } from './mcp-registry.js';

export type SkillFormat = 'markdown' | 'json' | 'yaml';

export type SkillSource = 'registry' | 'private';

export type SkillCategory =
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
  | 'other';

export interface SkillDetail {
  name: string;
  description: string;
  title?: string;
  version: string;
  content: string;
  format: SkillFormat;
  category?: SkillCategory;
  tags?: string[];
  websiteUrl?: string;
  repository?: {
    url: string;
    source: string;
    id?: string;
  };
  _meta?: {
    'com.mcp-nova.meta'?: NovaMeta;
    [key: string]: unknown;
  };
}

export interface SkillResponse {
  skill: SkillDetail;
  source?: SkillSource;
  _meta?: Record<string, unknown>;
}

export interface SkillListResponse {
  skills: SkillResponse[];
  metadata?: {
    nextCursor?: string;
    count?: number;
  };
}

export interface ListSkillsParams {
  cursor?: string;
  limit?: number;
  search?: string;
  updated_since?: string;
  version?: string;
  category?: SkillCategory;
  tags?: string;
  verified?: boolean;
  featured?: boolean;
  format?: SkillFormat;
  source?: SkillSource | 'all';
}
