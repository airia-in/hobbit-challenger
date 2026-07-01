import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLibsqlConfig } from './prisma-client';
import type { CreatePrismaClientOptions } from './prisma-client';

// dist/migrate-libsql.js -> ../prisma/migrations (the `prisma` folder is shipped
// via the package `files` allowlist, so it is present in the deployed image).
const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations');

// Mirrors the table Prisma's own `migrate deploy` creates, so a later local
// `prisma migrate status` against the same database stays consistent.
const CREATE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
);`;

/**
 * Apply Prisma migration SQL files to a remote libSQL/sqld database.
 *
 * Prisma's schema engine only speaks to local SQLite files, so `migrate deploy`
 * cannot target a libSQL server. This replicates the deploy semantics we need:
 * apply every unapplied migration in order and record it in `_prisma_migrations`.
 * Idempotent across restarts; fails loudly on an interrupted migration rather
 * than risking a double-apply.
 */
export async function applyLibsqlMigrations(
  options: CreatePrismaClientOptions = {},
): Promise<void> {
  const config = buildLibsqlConfig(options);
  if (!config) {
    throw new Error(
      'applyLibsqlMigrations requires a libSQL DATABASE_URL (got a file-based or empty URL)',
    );
  }
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  // `@libsql/client` is ESM-only; load it dynamically from this CommonJS module.
  const { createClient } = await import('@libsql/client');
  const client = createClient(config);
  try {
    await client.executeMultiple(CREATE_MIGRATIONS_TABLE);

    const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    const recorded = await client.execute(
      'SELECT migration_name, finished_at FROM "_prisma_migrations"',
    );
    const finishedByName = new Map<string, boolean>();
    for (const row of recorded.rows) {
      finishedByName.set(
        String(row.migration_name),
        row.finished_at !== null,
      );
    }

    let appliedCount = 0;
    for (const name of migrations) {
      const state = finishedByName.get(name);
      if (state === true) {
        continue;
      }
      if (state === false) {
        throw new Error(
          `Migration "${name}" is recorded as started but never finished. ` +
            'A previous migration run was interrupted; resolve it manually ' +
            'in `_prisma_migrations` before retrying.',
        );
      }

      const sqlPath = join(MIGRATIONS_DIR, name, 'migration.sql');
      if (!existsSync(sqlPath)) {
        continue;
      }
      const sql = readFileSync(sqlPath, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const id = randomUUID();

      console.log(`Applying migration \`${name}\``);
      await client.execute({
        sql: 'INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, current_timestamp, 0)',
        args: [id, checksum, name],
      });
      await client.executeMultiple(sql);
      await client.execute({
        sql: 'UPDATE "_prisma_migrations" SET finished_at = current_timestamp, applied_steps_count = 1 WHERE id = ?',
        args: [id],
      });
      appliedCount += 1;
    }

    if (appliedCount === 0) {
      console.log('No pending migrations to apply.');
    } else {
      console.log(
        `Applied ${appliedCount} migration(s). All migrations have been successfully applied.`,
      );
    }
  } finally {
    client.close();
  }
}

if (require.main === module) {
  applyLibsqlMigrations().catch((error) => {
    console.error('libSQL migration failed:', error);
    process.exit(1);
  });
}
