import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  D7_COHORT_SQL,
  queryD7CohortRates,
} from '../scripts/analytics/d7-cohort-query.mjs';

test('D7 cohort SQL anchors activity window on registered_at', () => {
  assert.match(D7_COHORT_SQL, /u\.createdAt AS registered_at/);
  assert.match(D7_COHORT_SQL, /pe\.createdAt >= c\.registered_at/);
  assert.match(
    D7_COHORT_SQL,
    /pe\.createdAt < datetime\(c\.registered_at, '\+7 days'\)/,
  );
  assert.doesNotMatch(
    D7_COHORT_SQL,
    /pe\.createdAt >= c\.cohort_week_start/,
    'D7 window must not use cohort_week_start',
  );
});

test('queryD7CohortRates delegates to prisma.$queryRawUnsafe', async () => {
  const rows = [{ cohort_week_start: '2026-06-30', registered: 1 }];
  let capturedSql;
  const prisma = {
    $queryRawUnsafe: async (sql) => {
      capturedSql = sql;
      return rows;
    },
  };

  const result = await queryD7CohortRates(prisma);
  assert.equal(capturedSql, D7_COHORT_SQL);
  assert.deepEqual(result, rows);
});

test('d7-cohort admin script exists and documents DATABASE_URL', async () => {
  const script = await readFile(
    new URL('../scripts/analytics/d7-cohort.mjs', import.meta.url),
    'utf8',
  );
  assert.match(script, /DATABASE_URL/);
  assert.match(script, /queryD7CohortRates/);
});
