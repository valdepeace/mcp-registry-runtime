import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3027),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_PATH: z.string().min(1).default('./data/agent-runtime.db'),
  JWT_SECRET: z.string().min(1).default('change-me-in-production'),
  CORS_ORIGINS: z
    .string()
    .transform((val) => {
      const origins = val.split(',').map((s) => s.trim()).filter(Boolean);
      return origins.length > 0 ? origins : ['*'];
    })
    .default('*'),
  REGISTRY_URL: z.string().url().default('http://localhost:3000'),
  RUNTIME_URL: z.string().url().default('http://localhost:3001'),
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
  runtimeUrl: validated.RUNTIME_URL,
};
