import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as compression from 'compression';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

async function bootstrap() {
  // Initialize Firebase Admin with service account if provided, otherwise use default (GCP)
  if (getApps().length === 0) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        initializeApp({ credential: cert(serviceAccount) });
        Logger.log('Firebase Admin initialized with service account credentials', 'Bootstrap');
      } catch (e) {
        Logger.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON, falling back to default', 'Bootstrap');
        initializeApp();
      }
    } else {
      // Falls back to GOOGLE_APPLICATION_CREDENTIALS or GCP default service account
      initializeApp();
    }
  }


  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads/' });

  app.use(compression());
  app.setGlobalPrefix('api');

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));

  // Swagger docs
  const config = new DocumentBuilder()
    .setTitle('UniVerse API')
    .setDescription('University Management Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 4000;
  await app.listen(port);

  Logger.log(`🚀 UniVerse API running at http://localhost:${port}/api`, 'Bootstrap');
  Logger.log(`📖 Swagger docs at http://localhost:${port}/docs`, 'Bootstrap');
}
bootstrap();
