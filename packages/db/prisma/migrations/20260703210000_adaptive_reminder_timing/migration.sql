-- AlterTable
ALTER TABLE "User" ADD COLUMN "reminderAdaptive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: nullable createdAt leaves pre-existing rows NULL so adaptive timing
-- ignores them until real post-migration check-ins record timestamps.
ALTER TABLE "ActivityLog" ADD COLUMN "createdAt" DATETIME;

-- CreateIndex
CREATE INDEX "ActivityLog_userId_date_idx" ON "ActivityLog"("userId", "date");
