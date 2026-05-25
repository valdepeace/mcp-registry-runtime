import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  OFFICIAL_REGISTRY_URL: z.string().url().default('https://registry.modelcontextprotocol.io'),
  OFFICIAL_SKILLS_REGISTRY_URL: z.string().url().optional(),
  OFFICIAL_AGENTS_REGISTRY_URL: z.string().url().optional(),
  SKILLS_SH_API_URL: z.string().url().optional(),
  SKILLS_SH_API_KEY: z.string().optional(),
  SMITHERY_API_URL: z.string().url().optional(),
  SMITHERY_SKILLS_MAX: z.coerce.number().int().min(0).optional(),
  SYNC_INTERVAL_MS: z.coerce.number().int().min(0).default(300_000),
  DB_PATH: z.string().min(1).default('./data/registry.db'),
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

// Use validated values, or fall back to all-defaults when validation failed (production)
const validated = parseResult.success
  ? parseResult.data
  : ConfigSchema.parse({});

export const config = {
  port: validated.PORT,
  nodeEnv: validated.NODE_ENV,
  officialRegistryUrl: validated.OFFICIAL_REGISTRY_URL,
  officialSkillsRegistryUrl: validated.OFFICIAL_SKILLS_REGISTRY_URL,
  officialAgentsRegistryUrl: validated.OFFICIAL_AGENTS_REGISTRY_URL,
  skillsShApiUrl: validated.SKILLS_SH_API_URL,
  skillsShApiKey: validated.SKILLS_SH_API_KEY,
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
