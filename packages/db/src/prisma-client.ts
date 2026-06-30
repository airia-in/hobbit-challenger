import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';

export type CreatePrismaClientOptions = {
  databaseUrl?: string;
  authToken?: string;
};

export function shouldUseLibsqlAdapter(url: string): boolean {
  return url.startsWith('libsql://');
}

export function getPrismaClientOptions(
  options: CreatePrismaClientOptions = {},
): ConstructorParameters<typeof PrismaClient>[0] | undefined {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? '';

  if (!shouldUseLibsqlAdapter(databaseUrl)) {
    return undefined;
  }

  const adapter = new PrismaLibSQL({
    url: databaseUrl,
    authToken: options.authToken ?? process.env.DATABASE_AUTH_TOKEN,
  });

  return { adapter };
}

export function createPrismaClient(
  options: CreatePrismaClientOptions = {},
): PrismaClient {
  const clientOptions = getPrismaClientOptions(options);
  return clientOptions ? new PrismaClient(clientOptions) : new PrismaClient();
}
