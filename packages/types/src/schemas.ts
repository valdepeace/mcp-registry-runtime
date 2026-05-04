import { z } from 'zod';
import { NOVA_META_NAMESPACE } from './mcp-registry.js';

export { NOVA_META_NAMESPACE };

export const ServerCategoryEnum = z.enum([
  'ai',
  'data',
  'development',
  'infrastructure',
  'integration',
  'security',
  'productivity',
  'other',
]);

export const NovaMetaSchema = z.object({
  tags: z.array(z.string().min(1).max(50)).max(10).optional(),
  category: ServerCategoryEnum.optional(),
  verified: z.boolean().optional(),
  featured: z.boolean().optional(),
  license: z.string().max(50).optional(),
  vendorOfficial: z.boolean().optional(),
});

export type NovaMetaSchemaType = z.infer<typeof NovaMetaSchema>;
export type ServerCategorySchemaType = z.infer<typeof ServerCategoryEnum>;

// Transport schemas
export const StdioTransportSchema = z.object({
  type: z.literal('stdio'),
});

export const StreamableHttpTransportSchema = z.object({
  type: z.literal('streamable-http'),
  url: z.string().url(),
  headers: z.array(z.object({
    name: z.string(),
    value: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
});

export const SseTransportSchema = z.object({
  type: z.literal('sse'),
  url: z.string().url(),
  headers: z.array(z.object({
    name: z.string(),
    value: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
});

export const LocalTransportSchema = z.discriminatedUnion('type', [
  StdioTransportSchema,
  StreamableHttpTransportSchema,
  SseTransportSchema,
]);

// Input schemas
export const InputSchema = z.object({
  description: z.string().optional(),
  isRequired: z.boolean().optional(),
  format: z.enum(['string', 'number', 'boolean', 'filepath']).optional(),
  value: z.string().optional(),
  isSecret: z.boolean().optional(),
  default: z.string().optional(),
  placeholder: z.string().optional(),
  choices: z.array(z.string()).optional(),
});

export const KeyValueInputSchema = InputSchema.extend({
  name: z.string(),
  variables: z.record(InputSchema).optional(),
});

export const PositionalArgumentSchema = InputSchema.extend({
  type: z.literal('positional'),
  valueHint: z.string().optional(),
  isRepeated: z.boolean().optional(),
  variables: z.record(InputSchema).optional(),
});

export const NamedArgumentSchema = InputSchema.extend({
  type: z.literal('named'),
  name: z.string(),
  isRepeated: z.boolean().optional(),
  variables: z.record(InputSchema).optional(),
});

export const ArgumentSchema = z.discriminatedUnion('type', [
  PositionalArgumentSchema,
  NamedArgumentSchema,
]);

// Repository schema
export const RepositorySchema = z.object({
  url: z.string().url(),
  source: z.string(),
  id: z.string().optional(),
  subfolder: z.string().optional(),
});

// Icon schema
export const IconSchema = z.object({
  src: z.string().url(),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']).optional(),
  sizes: z.array(z.string()).optional(),
  theme: z.enum(['light', 'dark']).optional(),
});

// Package schema
export const PackageSchema = z.object({
  registryType: z.string(),
  registryBaseUrl: z.string().url().optional(),
  identifier: z.string(),
  version: z.string().optional(),
  fileSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  runtimeHint: z.string().optional(),
  transport: LocalTransportSchema,
  runtimeArguments: z.array(ArgumentSchema).optional(),
  packageArguments: z.array(ArgumentSchema).optional(),
  environmentVariables: z.array(KeyValueInputSchema).optional(),
});

// Remote transport with variables
export const RemoteTransportSchema = z.union([
  StreamableHttpTransportSchema.extend({
    variables: z.record(InputSchema).optional(),
  }),
  SseTransportSchema.extend({
    variables: z.record(InputSchema).optional(),
  }),
]);

// Server Detail schema
export const ServerDetailSchema = z.object({
  name: z.string()
    .min(3)
    .max(200)
    .regex(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/),
  description: z.string().min(1).max(100),
  title: z.string().min(1).max(100).optional(),
  repository: RepositorySchema.optional(),
  version: z.string().max(255),
  websiteUrl: z.string().url().optional(),
  icons: z.array(IconSchema).optional(),
  $schema: z.string().url().optional(),
  packages: z.array(PackageSchema).optional(),
  remotes: z.array(RemoteTransportSchema).optional(),
  _meta: z.object({
    'io.modelcontextprotocol.registry/publisher-provided': z.record(z.unknown()).optional(),
    'com.mcp-nova.meta': NovaMetaSchema.optional(),
  }).catchall(z.unknown()).optional(),
});

// Create server request (for admin) - includes optional source
export const CreateServerSchema = ServerDetailSchema.extend({
  source: z.enum(['private', 'azure-devops']).optional().default('private'),
});

// Update server request (partial)
export const UpdateServerSchema = ServerDetailSchema.partial().omit({ name: true });

// Query params schema
export const ListServersQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  updated_since: z.string().datetime().optional(),
  version: z.string().optional(),
  transport_type: z.enum(['stdio', 'streamable-http', 'sse']).optional(),
  source: z.enum(['registry', 'private', 'azure-devops', 'all']).optional().default('all'),
  category: ServerCategoryEnum.optional(),
  tags: z.string().optional(),
  verified: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
  vendor_official: z.coerce.boolean().optional(),
});

export type CreateServerInput = z.infer<typeof CreateServerSchema>;
export type UpdateServerInput = z.infer<typeof UpdateServerSchema>;
export type ListServersQuery = z.infer<typeof ListServersQuerySchema>;

// Response schemas for validating external API responses
export const ServerResponseSchema = z.object({
  server: ServerDetailSchema,
  _meta: z.record(z.unknown()).optional(),
});

export const ServerListResponseSchema = z.object({
  servers: z.array(ServerResponseSchema),
  metadata: z
    .object({
      nextCursor: z.string().optional(),
      count: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
