-- AlterTable
ALTER TABLE "User" ADD COLUMN "recapFocus" JSONB;

-- AlterTable
ALTER TABLE "ReminderLog" ADD COLUMN "metadata" JSONB;
