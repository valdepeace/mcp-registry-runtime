import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

dotenv.config();

// Same reasoning as apps/registry and apps/runtime: default the DB next to
// the monorepo clone instead of the launching process's cwd.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const WORKSPACE_ROOT = path.dirname(REPO_ROOT);
const DEFAULT_DB_PATH = path.join(WORKSPACE_ROOT, 'mcp-registry-runtime-data', 'a2a-gateway.db');

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4271),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_PATH: z.string().min(1).default(DEFAULT_DB_PATH),

  // Where the actual catalog and runtime live — this service only translates.
  REGISTRY_URL: z.string().url().default('http://localhost:4269'),
  RUNTIME_URL: z.string().url().default('http://localhost:4270'),

  // The dashboard's own admin JWT (apps/runtime's JWT_SECRET) — key
  // management here reuses that login rather than inventing a second one.
  // Must match runtime's JWT_SECRET for the admin token to validate.
  JWT_SECRET: z.string().min(1).default('change-me-in-production'),

  // Minted internally (see runtime-client.service.ts) to call runtime/registry
  // admin routes on an external agent's behalf — the agent never sees this.
  SERVICE_JWT_TTL: z.string().default('5m'),

  CORS_ORIGINS: z
    .string()
    .transform((val) => {
      const origins = val.split(',').map((s) => s.trim()).filter(Boolean);
      return origins.length > 0 ? origins : ['*'];
    })
    .default('*'),

  // Public URL agents reach this gateway at — advertised in the Agent Card.
  PUBLIC_URL: z.string().url().default('http://localhost:4271'),
});

const parseResult = ConfigSchema.safeParse(process.env);

if (!parseResult.success) {
  const issues = parseResult.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  if (process.env.NODE_ENV === 'production') {
    console.warn('[Config] Validation warnings (using defaults):\n' + issues);
  } else {
    console.error('[Config] Invalid configuration:\n' + issues);
    throw new Error('Invalid configuration: check your .env file');
  }
}

if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET === 'change-me-in-production') {
  throw new Error('JWT_SECRET must be changed in production, and must match apps/runtime\'s.');
}

const validated = parseResult.success
  ? parseResult.data
  : ConfigSchema.parse({});

export const config = {
  port: validated.PORT,
  nodeEnv: validated.NODE_ENV,
  dbPath: validated.DB_PATH,
  registryUrl: validated.REGISTRY_URL,
  runtimeUrl: validated.RUNTIME_URL,
  jwtSecret: validated.JWT_SECRET,
  serviceJwtTtl: validated.SERVICE_JWT_TTL,
  corsOrigins: validated.CORS_ORIGINS,
  publicUrl: validated.PUBLIC_URL,
};
