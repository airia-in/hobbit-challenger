-- AlterTable
ALTER TABLE "Group" ADD COLUMN "leaderboardTime" TEXT;
ALTER TABLE "Group" ADD COLUMN "whatsappGroupJid" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "value" REAL,
    "tier" TEXT,
    "subPoints" JSONB,
    "state" TEXT,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "proofUrl" TEXT,
    "aiVerdict" TEXT,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ActivityLog_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ActivityLog" ("activityId", "aiVerdict", "challengeId", "createdAt", "date", "id", "proofUrl", "state", "subPoints", "tier", "userId", "value", "xpAwarded") SELECT "activityId", "aiVerdict", "challengeId", "createdAt", "date", "id", "proofUrl", "state", "subPoints", "tier", "userId", "value", "xpAwarded" FROM "ActivityLog";
DROP TABLE "ActivityLog";
ALTER TABLE "new_ActivityLog" RENAME TO "ActivityLog";
CREATE INDEX "ActivityLog_userId_activityId_date_idx" ON "ActivityLog"("userId", "activityId", "date");
CREATE INDEX "ActivityLog_userId_date_idx" ON "ActivityLog"("userId", "date");
CREATE UNIQUE INDEX "ActivityLog_challengeId_activityId_date_key" ON "ActivityLog"("challengeId", "activityId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
