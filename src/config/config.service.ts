import { Injectable } from '@nestjs/common';
import { env, type Env } from './env';

/**
 * Injectable typed wrapper around the validated env object.
 *
 * Prefer this over reading `process.env` directly so tests can override
 * values via Nest's module mocking.
 */
@Injectable()
export class AppConfigService {
  get nodeEnv(): Env['NODE_ENV'] {
    return env.NODE_ENV;
  }

  get port(): number {
    return env.PORT;
  }

  get databaseUrl(): string {
    return env.DATABASE_URL;
  }

  get redisUrl(): string {
    return env.REDIS_URL;
  }

  get apiPrefix(): string {
    return env.API_PREFIX;
  }

  get corsOrigins(): string[] | true {
    if (!env.CORS_ORIGINS) return true;
    return env.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  get jwtAccessSecret(): string {
    return env.JWT_ACCESS_SECRET;
  }

  get jwtRefreshSecret(): string {
    return env.JWT_REFRESH_SECRET;
  }

  get jwtAccessTtl(): string {
    return env.JWT_ACCESS_TTL;
  }

  get jwtRefreshTtl(): string {
    return env.JWT_REFRESH_TTL;
  }

  get oauthDevMode(): boolean {
    return env.OAUTH_DEV_MODE;
  }

  get googleOAuthClientId(): string | undefined {
    return env.GOOGLE_OAUTH_CLIENT_ID;
  }

  get appleOAuthAudience(): string | undefined {
    return env.APPLE_OAUTH_AUDIENCE;
  }

  get uploadsMaxBytes(): number {
    return env.UPLOADS_MAX_BYTES;
  }

  get s3Endpoint(): string {
    return env.S3_ENDPOINT;
  }

  get s3Region(): string {
    return env.S3_REGION;
  }

  get s3Bucket(): string {
    return env.S3_BUCKET;
  }

  get s3AccessKeyId(): string {
    return env.S3_ACCESS_KEY_ID;
  }

  get s3SecretAccessKey(): string {
    return env.S3_SECRET_ACCESS_KEY;
  }

  get s3PublicBaseUrl(): string {
    return env.S3_PUBLIC_BASE_URL;
  }

  get s3ForcePathStyle(): boolean {
    return env.S3_FORCE_PATH_STYLE;
  }

  get isProduction(): boolean {
    return env.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return env.NODE_ENV === 'test';
  }
}
