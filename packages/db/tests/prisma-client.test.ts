import { describe, expect, it } from 'vitest';
import {
  buildLibsqlConfig,
  createPrismaClient,
  shouldUseLibsqlAdapter,
} from '../src/prisma-client';

describe('shouldUseLibsqlAdapter', () => {
  it('returns true for every remote libSQL scheme', () => {
    expect(shouldUseLibsqlAdapter('libsql://your-db.turso.io')).toBe(true);
    expect(shouldUseLibsqlAdapter('libsql://localhost:8080')).toBe(true);
    expect(shouldUseLibsqlAdapter('http://libsql-server:8080')).toBe(true);
    expect(shouldUseLibsqlAdapter('https://libsql-server:8080')).toBe(true);
    expect(shouldUseLibsqlAdapter('ws://libsql-server:8080')).toBe(true);
    expect(shouldUseLibsqlAdapter('wss://libsql-server:8080')).toBe(true);
  });

  it('returns false for file, empty, and other sqlite URLs', () => {
    expect(shouldUseLibsqlAdapter('file:../../../data/dev.db')).toBe(false);
    expect(shouldUseLibsqlAdapter('file:/app/data/prod.db')).toBe(false);
    expect(shouldUseLibsqlAdapter('')).toBe(false);
    expect(shouldUseLibsqlAdapter('  ')).toBe(false);
    expect(shouldUseLibsqlAdapter('sqlite:./dev.db')).toBe(false);
  });
});

describe('buildLibsqlConfig', () => {
  it('returns undefined for file-based SQLite URLs', () => {
    expect(buildLibsqlConfig({ databaseUrl: 'file:/app/data/prod.db' })).toBe(
      undefined,
    );
    expect(buildLibsqlConfig({ databaseUrl: '' })).toBe(undefined);
  });

  it('passes libsql URLs through without a custom fetch when uncredentialed', () => {
    const config = buildLibsqlConfig({
      databaseUrl: 'libsql://your-db.turso.io',
      authToken: 'token-123',
    });

    expect(config).toBeDefined();
    expect(config?.url).toBe('libsql://your-db.turso.io');
    expect(config?.authToken).toBe('token-123');
    expect(config?.fetch).toBeUndefined();
  });

  it('strips embedded basic-auth credentials and injects an Authorization header', async () => {
    const config = buildLibsqlConfig({
      databaseUrl: 'http://libsql:s3cr3t@libsql-host:8080',
    });

    expect(config).toBeDefined();
    // Credentials must be removed from the URL — undici rejects credentialed URLs.
    expect(config?.url).toBe('http://libsql-host:8080');
    expect(config?.fetch).toBeTypeOf('function');

    // The custom fetch adds the expected Basic header to the outgoing request.
    const captured: Record<string, string | null> = {};
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: Request) => {
      captured.authorization = input.headers.get('Authorization');
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    try {
      await config?.fetch?.('http://libsql-host:8080/v2/pipeline', {
        method: 'POST',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const expected = `Basic ${Buffer.from('libsql:s3cr3t').toString('base64')}`;
    expect(captured.authorization).toBe(expected);
  });
});

describe('createPrismaClient', () => {
  it('returns a PrismaClient instance for file URLs without connecting', () => {
    const client = createPrismaClient({
      databaseUrl: 'file:../../../data/dev.db',
    });

    expect(client).toBeDefined();
    expect(typeof client.$connect).toBe('function');
    expect(typeof client.$disconnect).toBe('function');
    expect(typeof client.user.findMany).toBe('function');
  });
});
