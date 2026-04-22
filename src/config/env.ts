import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
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

    // Audiences for real Google + Apple verification. Only consulted
    // when OAUTH_DEV_MODE=false; the cross-field check below makes them
    // required in that case so a misconfigured prod can't silently
    // accept any Google/Apple-issued token.
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    APPLE_OAUTH_AUDIENCE: z.string().optional(),

    // Uploads — bytes go to an S3-compatible service. Defaults point
    // at the MinIO container in docker-compose; production overrides
    // the endpoint + credentials to hit Cloudflare R2 (or equivalent)
    // without any code change.
    UPLOADS_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 1024 * 1024),
    S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().default('shoppa-uploads'),
    S3_ACCESS_KEY_ID: z.string().default('minioadmin'),
    S3_SECRET_ACCESS_KEY: z.string().default('minioadmin'),
    S3_PUBLIC_BASE_URL: z.string().default('http://localhost:9000/shoppa-uploads'),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .superRefine((val, ctx) => {
    if (!val.OAUTH_DEV_MODE) {
      if (!val.GOOGLE_OAUTH_CLIENT_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['GOOGLE_OAUTH_CLIENT_ID'],
          message: 'GOOGLE_OAUTH_CLIENT_ID is required when OAUTH_DEV_MODE=false',
        });
      }
      if (!val.APPLE_OAUTH_AUDIENCE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['APPLE_OAUTH_AUDIENCE'],
          message: 'APPLE_OAUTH_AUDIENCE is required when OAUTH_DEV_MODE=false',
        });
      }
    }
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
