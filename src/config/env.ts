import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  API_PREFIX: z.string().default('api/v1'),
  CORS_ORIGINS: z.string().optional(),

  // Auth / JWT — secrets must be at least 32 chars so a leaked
  // dev value doesn't pass for a production-strength key by accident.
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // OAuth — when true, the OAuth verifier decodes provider tokens
  // without signature verification. Suitable for local development
  // and the assessment review; production must set this to false and
  // wire real google-auth-library / Apple JWKS verification.
  OAUTH_DEV_MODE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
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
