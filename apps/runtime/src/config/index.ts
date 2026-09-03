import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

dotenv.config();

// Same reasoning as apps/registry: default the DB next to the monorepo
// clone (workspace root = repo root's parent) instead of the launching
// process's cwd, so it's always in the same, discoverable place.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const WORKSPACE_ROOT = path.dirname(REPO_ROOT);
const DEFAULT_DB_PATH = path.join(WORKSPACE_ROOT, 'mcp-registry-runtime-data', 'runtime.db');

// Cloned MCP repos live under the user's home dir by default, not the cwd the
// process happened to be started from — so the same path is found regardless
// of where `npm run dev:runtime` was launched.
const DEFAULT_REPOS_DIR = path.join(os.homedir(), '.registry-mcp-runtime', 'repos');

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4270),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_PATH: z.string().min(1).default(DEFAULT_DB_PATH),
  JWT_SECRET: z.string().min(1).default('change-me-in-production'),
  CORS_ORIGINS: z
    .string()
    .transform((val) => {
      const origins = val.split(',').map((s) => s.trim()).filter(Boolean);
      return origins.length > 0 ? origins : ['*'];
    })
    .default('*'),
  REGISTRY_URL: z.string().url().default('http://localhost:4269'),
  REPOS_DIR: z.string().min(1).default(DEFAULT_REPOS_DIR),
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
  throw new Error('JWT_SECRET must be changed in production. Set it in your .env file.');
}

const validated = parseResult.success
  ? parseResult.data
  : ConfigSchema.parse({});

export const config = {
  port: validated.PORT,
  nodeEnv: validated.NODE_ENV,
  dbPath: validated.DB_PATH,
  jwtSecret: validated.JWT_SECRET,
  corsOrigins: validated.CORS_ORIGINS,
  registryUrl: validated.REGISTRY_URL,
  reposDir: validated.REPOS_DIR,
};
