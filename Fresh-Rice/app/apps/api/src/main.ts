import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

// Last line of defence: log instead of dying on a stray stream/promise error (pm2 keeps nest --watch alive, but the
// child API process it spawned would otherwise stay dead until the next file change).
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: { origin: (process.env.CORS_ORIGINS || '*').split(',') }, rawBody: true });
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(json({ limit: '6mb' })); app.use(urlencoded({ extended: true, limit: '6mb' }));
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const cfg = new DocumentBuilder().setTitle('FreshRice API').setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, cfg));
  if ((process.env.JWT_SECRET || 'change-me-in-prod') === 'change-me-in-prod' && process.env.NODE_ENV === 'production') console.warn('WARNING: JWT_SECRET is the default value. Set a strong secret in .env');
  const port = Number(process.env.API_PORT || 4100);
  await app.listen(port);
  console.log(`FreshRice API on http://localhost:${port}/v1  (docs: /docs)  payments=${process.env.RAZORPAY_KEY_ID ? 'razorpay' : 'mock'} whatsapp=${process.env.WHATSAPP_TOKEN ? 'live' : 'log'} otp=${process.env.MSG91_AUTHKEY ? 'msg91' : 'dev'}`);
}
bootstrap();
