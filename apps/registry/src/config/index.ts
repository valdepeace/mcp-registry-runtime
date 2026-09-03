import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

dotenv.config();

// The DB should live in a fixed, discoverable place on disk — not wherever
// the process happened to be launched from (nx, pm2, a plain `node
// dist/index.js`, ...) and not some hidden OS temp dir. Default it next to
// the monorepo clone itself: apps/registry/{src,dist}/config -> up 4 is the
// repo root, and its parent is the workspace folder every dev already has
// (the folder they ran `git clone` in), so the whole team finds the DB in
// the same place with zero config.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const WORKSPACE_ROOT = path.dirname(REPO_ROOT);
const DEFAULT_DB_PATH = path.join(WORKSPACE_ROOT, 'mcp-registry-runtime-data', 'registry.db');

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4269),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  OFFICIAL_REGISTRY_URL: z.string().url().default('https://registry.modelcontextprotocol.io'),
  OFFICIAL_SKILLS_REGISTRY_URL: z.string().url().optional(),
  SKILLS_SH_API_URL: z.string().url().optional(),
  SKILLS_SH_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  SMITHERY_API_URL: z.string().url().optional(),
  SMITHERY_SKILLS_MAX: z.coerce.number().int().min(0).optional(),
  SYNC_INTERVAL_MS: z.coerce.number().int().min(0).default(300_000),
  DB_PATH: z.string().min(1).default(DEFAULT_DB_PATH),
  JWT_SECRET: z.string().min(1).default('change-me-in-production'),
  JWT_EXPIRES_IN: z.string().min(1).default('24h'),
  ADMIN_USERNAME: z.string().min(1).default('admin'),
  ADMIN_PASSWORD: z.string().min(1).default('admin'),
  CORS_ORIGINS: z
    .string()
    .transform((val) => {
      const origins = val.split(',').map((s) => s.trim()).filter(Boolean);
      return origins.length > 0 ? origins : ['*'];
    })
    .default('*'),
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

// Use validated values, or fall back to all-defaults when validation failed (production)
const validated = parseResult.success
  ? parseResult.data
  : ConfigSchema.parse({});

export const config = {
  port: validated.PORT,
  nodeEnv: validated.NODE_ENV,
  officialRegistryUrl: validated.OFFICIAL_REGISTRY_URL,
  officialSkillsRegistryUrl: validated.OFFICIAL_SKILLS_REGISTRY_URL,
  skillsShApiUrl: validated.SKILLS_SH_API_URL,
  skillsShApiKey: validated.SKILLS_SH_API_KEY,
  githubToken: validated.GITHUB_TOKEN,
  smitheryApiUrl: validated.SMITHERY_API_URL,
  smitherySkillsMax: validated.SMITHERY_SKILLS_MAX,
  syncIntervalMs: validated.SYNC_INTERVAL_MS,
  dbPath: validated.DB_PATH,
  jwtSecret: validated.JWT_SECRET,
  jwtExpiresIn: validated.JWT_EXPIRES_IN,
  adminUsername: validated.ADMIN_USERNAME,
  adminPassword: validated.ADMIN_PASSWORD,
  corsOrigins: validated.CORS_ORIGINS,
};
