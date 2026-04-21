import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  API_PREFIX: z.string().default('api/v1'),
  CORS_ORIGINS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast on startup with a readable error so misconfigured deployments
  // never silently boot with missing credentials.
  const flat = parsed.error.flatten();
  const fieldErrors = Object.entries(flat.fieldErrors)
    .map(([key, msgs]) => `  ${key}: ${(msgs ?? []).join(', ')}`)
    .join('\n');
  throw new Error(`Invalid environment variables:\n${fieldErrors}`);
}

export const env: Env = parsed.data;
