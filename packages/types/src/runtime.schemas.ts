import { z } from 'zod';

export const RuntimeStatusEnum = z.enum(['stopped', 'starting', 'online', 'stopping', 'errored', 'degraded']);

export const CreateRuntimeInstanceSchema = z.object({
  server_name: z.string()
    .min(1)
    .max(200)
    .regex(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/, 'Must be in format org/name'),
  version: z.string().min(1).max(255),
  source: z.enum(['registry', 'private', 'azure-devops']).optional(),

  exec_cmd: z.string().min(1).max(500),
  exec_args: z.array(z.string()).optional(),
  cwd: z.string().max(1000).optional(),
  env_json: z.record(z.string()).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  endpoint_url: z.string().url().optional(),
  health_url: z.string().url().optional(),
});

export const UpdateRuntimeInstanceSchema = z.object({
  exec_cmd: z.string().min(1).max(500).optional(),
  exec_args: z.array(z.string()).optional(),
  cwd: z.string().max(1000).optional(),
  env_json: z.record(z.string()).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  endpoint_url: z.string().url().optional(),
  health_url: z.string().url().optional(),
});

export const LogsQuerySchema = z.object({
  tail: z.coerce.number().int().min(1).max(1000).optional().default(200),
});

export type CreateRuntimeInstanceInput = z.infer<typeof CreateRuntimeInstanceSchema>;
export type UpdateRuntimeInstanceInput = z.infer<typeof UpdateRuntimeInstanceSchema>;
export type LogsQuery = z.infer<typeof LogsQuerySchema>;
