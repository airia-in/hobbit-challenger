-- AlterTable
ALTER TABLE "User" ADD COLUMN "reminderAdaptive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "ActivityLog_userId_date_idx" ON "ActivityLog"("userId", "date");
