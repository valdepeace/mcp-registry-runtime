import { z } from 'zod';
import { RegistryMetaSchema, REGISTRY_META_NAMESPACE } from './schemas.js';
import { RepositorySchema } from './schemas.js';
import { SkillNameSchema } from './skills.schemas.js';

export { REGISTRY_META_NAMESPACE };

export const AgentCategoryEnum = z.enum([
  'ai',
  'data',
  'development',
  'infrastructure',
  'integration',
  'security',
  'productivity',
  'frontend',
  'backend',
  'devops',
  'qa',
  'other',
]);

export const AgentTypeEnum = z.enum([
  'backend-engineer',
  'frontend-engineer',
  'devops-engineer',
  'explore',
  'general',
  'qa-back',
  'qa-front',
  'custom',
]);

export const SkillRefSchema = z.object({
  name: SkillNameSchema,
  version: z.string().max(255),
});

export const MCPServerRefSchema = z.object({
  name: z.string().min(1).max(200),
  version: z.string().max(255),
});

export const AgentDetailSchema = z.object({
  name: SkillNameSchema,
  description: z.string().min(1).max(1000),
  title: z.string().min(1).max(200).optional(),
  version: z.string().max(255),
  instructions: z.string().min(1),
  required_skills: z.array(SkillRefSchema).optional().default([]),
  required_mcp_servers: z.array(MCPServerRefSchema).optional().default([]),
  subagent_type: AgentTypeEnum,
  tool_access: z.array(z.string().min(1)).optional(),
  category: AgentCategoryEnum.optional(),
  tags: z.array(z.string().min(1).max(50)).max(10).optional(),
  websiteUrl: z.string().url().optional(),
  repository: RepositorySchema.optional(),
  _meta: z.object({
    'com.mcp-registry-runtime.meta': RegistryMetaSchema.optional(),
  }).catchall(z.unknown()).optional(),
});

export const CreateAgentSchema = AgentDetailSchema.extend({
  source: z.enum(['private']).optional().default('private'),
});

export const UpdateAgentSchema = AgentDetailSchema.partial().omit({ name: true });

export const ListAgentsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  updated_since: z.string().datetime().optional(),
  version: z.string().optional(),
  category: AgentCategoryEnum.optional(),
  tags: z.string().optional(),
  verified: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
  subagent_type: AgentTypeEnum.optional(),
  source: z.enum(['registry', 'private', 'all']).optional().default('all'),
});

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;
export type ListAgentsQuery = z.infer<typeof ListAgentsQuerySchema>;

export const AgentResponseSchema = z.object({
  agent: AgentDetailSchema,
  _meta: z.record(z.unknown()).optional(),
});

export const AgentListResponseSchema = z.object({
  agents: z.array(AgentResponseSchema),
  metadata: z
    .object({
      nextCursor: z.string().optional(),
      count: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
