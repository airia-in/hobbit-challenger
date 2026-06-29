import 'reflect-metadata';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { AuthService } from './services/auth.service';
import { TasksService } from './services/tasks.service';
import { appRouter } from './trpc/router';
import { createContextFactory } from './trpc/context';

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
  const tasksService = app.get(TasksService);
  const createContext = createContextFactory({
    prisma,
    authService,
    tasksService,
  });

  const fastify = app.getHttpAdapter().getInstance();

  await mkdir(uploadDir, { recursive: true });

  await fastify.register(multipart, {
    limits: {
      fileSize: maxUploadBytes,
    },
  });

  await fastify.register(fastifyStatic, {
    root: uploadDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  fastify.post('/api/uploads', async (request, reply) => {
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const ext = path.extname(data.filename);
    const filename = `${randomUUID()}${ext}`;
    const filepath = path.join(uploadDir, filename);

    await pipeline(data.file, createWriteStream(filepath));

    return { url: `/uploads/${filename}` };
  });

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
