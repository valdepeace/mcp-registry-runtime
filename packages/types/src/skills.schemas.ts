import { z } from 'zod';
import { NovaMetaSchema, NOVA_META_NAMESPACE } from './schemas.js';
import { RepositorySchema } from './schemas.js';

export { NOVA_META_NAMESPACE };

export const SkillFormatEnum = z.enum(['markdown', 'json', 'yaml']);

export const SkillCategoryEnum = z.enum([
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
  'other',
]);

export const SkillNameSchema = z.string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*(\/[a-zA-Z0-9][a-zA-Z0-9._-]*)?$/);

export const SkillDetailSchema = z.object({
  name: SkillNameSchema,
  description: z.string().min(1).max(1000),
  title: z.string().min(1).max(200).optional(),
  version: z.string().max(255),
  content: z.string().min(1),
  format: SkillFormatEnum,
  category: SkillCategoryEnum.optional(),
  tags: z.array(z.string().min(1).max(50)).max(10).optional(),
  websiteUrl: z.string().url().optional(),
  repository: RepositorySchema.optional(),
  _meta: z.object({
    'com.mcp-nova.meta': NovaMetaSchema.optional(),
  }).catchall(z.unknown()).optional(),
});

export const CreateSkillSchema = SkillDetailSchema.extend({
  source: z.enum(['private']).optional().default('private'),
});

export const UpdateSkillSchema = SkillDetailSchema.partial().omit({ name: true });

export const ListSkillsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  updated_since: z.string().datetime().optional(),
  version: z.string().optional(),
  category: SkillCategoryEnum.optional(),
  tags: z.string().optional(),
  verified: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
  format: SkillFormatEnum.optional(),
  source: z.enum(['registry', 'private', 'all']).optional().default('all'),
});

export type CreateSkillInput = z.infer<typeof CreateSkillSchema>;
export type UpdateSkillInput = z.infer<typeof UpdateSkillSchema>;
export type ListSkillsQuery = z.infer<typeof ListSkillsQuerySchema>;

export const SkillResponseSchema = z.object({
  skill: SkillDetailSchema,
  source: z.enum(['registry', 'private']).optional(),
  provider_name: z.string().optional(),
  _meta: z.record(z.unknown()).optional(),
});

export const SkillListResponseSchema = z.object({
  skills: z.array(SkillResponseSchema),
  metadata: z
    .object({
      nextCursor: z.string().optional(),
      count: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
