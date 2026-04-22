import { AppConfigService } from './config.service';
import { env } from './env';

describe('AppConfigService', () => {
  const mutableEnv: { [K in keyof typeof env]: (typeof env)[K] } = env;
  const original = { ...env };
  let service: AppConfigService;

  beforeEach(() => {
    service = new AppConfigService();
  });

  afterEach(() => {
    Object.assign(mutableEnv, original);
  });

  it('exposes each env field via its typed getter', () => {
    expect(service.nodeEnv).toBe(env.NODE_ENV);
    expect(service.port).toBe(env.PORT);
    expect(service.databaseUrl).toBe(env.DATABASE_URL);
    expect(service.redisUrl).toBe(env.REDIS_URL);
    expect(service.apiPrefix).toBe(env.API_PREFIX);
    expect(service.jwtAccessSecret).toBe(env.JWT_ACCESS_SECRET);
    expect(service.jwtRefreshSecret).toBe(env.JWT_REFRESH_SECRET);
    expect(service.jwtAccessTtl).toBe(env.JWT_ACCESS_TTL);
    expect(service.jwtRefreshTtl).toBe(env.JWT_REFRESH_TTL);
    expect(service.oauthDevMode).toBe(env.OAUTH_DEV_MODE);
    expect(service.googleOAuthClientId).toBe(env.GOOGLE_OAUTH_CLIENT_ID);
    expect(service.appleOAuthAudience).toBe(env.APPLE_OAUTH_AUDIENCE);
    expect(service.uploadsMaxBytes).toBe(env.UPLOADS_MAX_BYTES);
    expect(service.s3Endpoint).toBe(env.S3_ENDPOINT);
    expect(service.s3Region).toBe(env.S3_REGION);
    expect(service.s3Bucket).toBe(env.S3_BUCKET);
    expect(service.s3AccessKeyId).toBe(env.S3_ACCESS_KEY_ID);
    expect(service.s3SecretAccessKey).toBe(env.S3_SECRET_ACCESS_KEY);
    expect(service.s3PublicBaseUrl).toBe(env.S3_PUBLIC_BASE_URL);
    expect(service.s3ForcePathStyle).toBe(env.S3_FORCE_PATH_STYLE);
  });

  describe('corsOrigins', () => {
    it('returns true (allow all) when CORS_ORIGINS is unset', () => {
      mutableEnv.CORS_ORIGINS = undefined;
      expect(service.corsOrigins).toBe(true);
    });

    it('splits, trims, and drops empty entries when CORS_ORIGINS is set', () => {
      mutableEnv.CORS_ORIGINS = 'https://a.com,  https://b.com , ,https://c.com';
      expect(service.corsOrigins).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
    });
  });

  describe('environment flags', () => {
    it('isProduction true only when NODE_ENV=production', () => {
      mutableEnv.NODE_ENV = 'production';
      expect(service.isProduction).toBe(true);
      expect(service.isTest).toBe(false);
    });

    it('isTest true only when NODE_ENV=test', () => {
      mutableEnv.NODE_ENV = 'test';
      expect(service.isTest).toBe(true);
      expect(service.isProduction).toBe(false);
    });

    it('both false in development', () => {
      mutableEnv.NODE_ENV = 'development';
      expect(service.isProduction).toBe(false);
      expect(service.isTest).toBe(false);
    });
  });
});
