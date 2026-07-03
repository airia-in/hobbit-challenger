import 'reflect-metadata';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { AuthService } from './services/auth.service';
import { ActivitiesService } from './services/activities.service';
import { GuidanceService } from './services/guidance.service';
import { appRouter } from './trpc/router';
import { createContextFactory } from './trpc/context';
import {
  createUploadFileHandler,
  createUploadHandler,
} from './uploads/upload-handler';
import {
  createWebhookRateLimitPreHandlers,
  getUploadRateLimitConfig,
  registerAbuseRateLimits,
} from './rate-limit';
import {
  buildEvolutionWebhookAuthConfig,
  createEvolutionWebhookHandler,
  logWebhookAuthStartupWarning,
} from './whatsapp/evolution-webhook.handler';
import { MAX_WEBHOOK_BODY_BYTES } from './whatsapp/evolution-inbound.parser';
import { InteractiveCheckinService } from './whatsapp/interactive-checkin.service';
import { MilestoneCardService } from './services/milestone-card.service';
import { createMilestoneCardHandler } from './milestones/milestone-card.handler';

async function bootstrap() {
  const allowedOrigins = (
    process.env.CORS_ORIGIN ??
    'http://localhost:3000,http://localhost:4321,http://127.0.0.1:4321'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const repoRoot = path.resolve(__dirname, '../../..');
  const uploadDir = path.isAbsolute(process.env.UPLOAD_DIR ?? '')
    ? (process.env.UPLOAD_DIR as string)
    : path.resolve(repoRoot, process.env.UPLOAD_DIR ?? 'data/uploads');
  const maxUploadBytes = parseInt(
    process.env.MAX_UPLOAD_BYTES ?? '10485760',
    10,
  );

  const adapter = new FastifyAdapter({
    logger: process.env.NODE_ENV !== 'test',
    trustProxy: true,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
  );

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    credentials: true,
  });

  const prisma = app.get(PrismaService);
  const authService = app.get(AuthService);
  const activitiesService = app.get(ActivitiesService);
  const guidanceService = app.get(GuidanceService);
  const interactiveCheckin = app.get(InteractiveCheckinService);
  const milestoneCardService = app.get(MilestoneCardService);
  const createContext = createContextFactory({
    prisma,
    authService,
    activitiesService,
    guidanceService,
  });

  const fastify = app.getHttpAdapter().getInstance();

  await mkdir(uploadDir, { recursive: true });
  const rateLimitConfig = await registerAbuseRateLimits(fastify, {
    authService,
  });
  const webhookRateLimitPreHandlers = createWebhookRateLimitPreHandlers(
    fastify,
    rateLimitConfig,
  );

  logWebhookAuthStartupWarning(process.env);

  await fastify.register(multipart, {
    limits: {
      fileSize: maxUploadBytes,
    },
  });

  fastify.post(
    '/api/uploads',
    {
      config: {
        rateLimit: getUploadRateLimitConfig(rateLimitConfig, authService),
      },
    },
    createUploadHandler({ uploadDir, authService, prisma }),
  );
  fastify.post(
    '/api/webhooks/evolution',
    {
      bodyLimit: MAX_WEBHOOK_BODY_BYTES,
      preHandler: webhookRateLimitPreHandlers,
    },
    createEvolutionWebhookHandler({
      interactiveCheckin,
      authConfig: buildEvolutionWebhookAuthConfig(process.env),
    }),
  );
  fastify.get<{ Params: { filename?: string } }>(
    '/uploads/:filename',
    createUploadFileHandler({ uploadDir, authService, prisma }),
  );
  fastify.get<{ Params: { milestoneKey?: string } }>(
    '/api/milestones/:milestoneKey/card',
    createMilestoneCardHandler({
      cardService: milestoneCardService,
      authService,
      prisma,
    }),
  );

  await fastify.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
      onError: ({ error }: { error: { code: string } }) => {
        if (error.code === 'INTERNAL_SERVER_ERROR') {
          console.error('tRPC internal error:', error);
        }
      },
    },
  });

  const port = parseInt(process.env.PORT ?? '3001', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`API running on http://localhost:${port}`);
  console.log(`tRPC endpoint: http://localhost:${port}/trpc`);
}

bootstrap();
