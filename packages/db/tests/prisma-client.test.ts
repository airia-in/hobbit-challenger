import { describe, expect, it } from 'vitest';
import {
  createPrismaClient,
  shouldUseLibsqlAdapter,
} from '../src/prisma-client';

describe('shouldUseLibsqlAdapter', () => {
  it('returns true for libsql:// URLs', () => {
    expect(shouldUseLibsqlAdapter('libsql://your-db.turso.io')).toBe(true);
    expect(shouldUseLibsqlAdapter('libsql://localhost:8080')).toBe(true);
  });

  it('returns false for file, empty, and other sqlite URLs', () => {
    expect(shouldUseLibsqlAdapter('file:../../../data/dev.db')).toBe(false);
    expect(shouldUseLibsqlAdapter('file:/app/data/prod.db')).toBe(false);
    expect(shouldUseLibsqlAdapter('')).toBe(false);
    expect(shouldUseLibsqlAdapter('sqlite:./dev.db')).toBe(false);
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
