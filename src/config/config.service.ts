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

  get isProduction(): boolean {
    return env.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return env.NODE_ENV === 'test';
  }
}
