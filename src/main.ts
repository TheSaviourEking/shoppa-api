import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Security headers
  app.use(helmet());

  // CORS — allow-all in dev, explicit origins when CORS_ORIGINS is set
  const corsOrigins = env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : true;
  app.enableCors({ origin: corsOrigins, credentials: true });

  // Reject unknown fields at the edge so controllers work against a
  // narrow, validated input surface. transform: true runs
  // class-transformer so DTOs receive real instances.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Static-serve uploaded files at their public base URL (default
  // /uploads). Mounted before the global prefix is applied so the URL
  // we hand back to clients (e.g. /uploads/2026/04/22/<id>.jpg)
  // resolves at the root path, not under the API version.
  app.use(env.UPLOADS_PUBLIC_BASE_URL, express.static(resolve(env.UPLOADS_DIR)));

  // Route versioning. Health is excluded so infrastructure probes
  // can keep hitting /health regardless of API version bumps.
  app.setGlobalPrefix(env.API_PREFIX, {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  // OpenAPI — served at /docs (outside the API prefix) so reviewers
  // get a navigable reference without guessing the version.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Shoppa API')
    .setDescription('Page 3 backend for the Shoppa engineering assessment')
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(env.PORT);
  logger.log(`Shoppa API listening on :${env.PORT} (env=${env.NODE_ENV})`);
  logger.log(`Swagger docs available at http://localhost:${env.PORT}/docs`);
}

void bootstrap();
