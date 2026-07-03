import { createPrismaClient } from '@workspace-starter/db';
import { D7_COHORT_SQL, queryD7CohortRates } from './d7-cohort-query.mjs';

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const prisma = createPrismaClient({ databaseUrl });
  try {
    const rows = await queryD7CohortRates(prisma);
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
