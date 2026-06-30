import { PrismaClient } from '@prisma/client';
import { seedGroupActivities } from '../src/seed-activities';

const prisma = new PrismaClient();

async function main() {
  const groups = await prisma.group.findMany({ select: { id: true } });

  for (const group of groups) {
    await seedGroupActivities(prisma, group.id);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
