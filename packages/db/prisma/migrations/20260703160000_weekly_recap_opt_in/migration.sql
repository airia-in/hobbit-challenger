-- AlterTable
ALTER TABLE "User" ADD COLUMN "weeklyRecapOptIn" BOOLEAN NOT NULL DEFAULT true;

-- Phoneless users cannot enable recap via profile (#152); default opt-out.
UPDATE "User" SET "weeklyRecapOptIn" = false WHERE phone IS NULL;
