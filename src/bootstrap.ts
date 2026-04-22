import { type INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { env } from './config/env';

/**
 * Apply the same middleware + pipes used by the production server.
 * main.ts and the e2e test both call this so the test surface
 * mirrors what reviewers hit in dev.
 */
export function configureApp(app: INestApplication): void {
  app.use(helmet());

  const corsOrigins = env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : true;
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix(env.API_PREFIX, {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
}
