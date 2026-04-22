import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  configureApp(app);

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
