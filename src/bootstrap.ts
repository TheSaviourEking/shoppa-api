import { type INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import express from 'express';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { env } from './config/env';

/**
 * Apply the same middleware + pipes + static config used by the
 * production server. main.ts and the e2e test both call this so the
 * test surface mirrors what reviewers hit in dev.
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

  app.use(env.UPLOADS_PUBLIC_BASE_URL, express.static(resolve(env.UPLOADS_DIR)));

  app.setGlobalPrefix(env.API_PREFIX, {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
}
