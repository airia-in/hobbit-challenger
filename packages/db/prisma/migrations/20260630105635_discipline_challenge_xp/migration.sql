/*
  Warnings:

  - You are about to drop the `Attempt` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DayResult` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TaskLog` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Attempt";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DayResult";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TaskLog";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "groupId" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "lengthDays" INTEGER NOT NULL DEFAULT 30,
    "currentDay" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Challenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT,
    "ownerUserId" TEXT,
    "seedKey" TEXT,
    "title" TEXT NOT NULL,
    "emoji" TEXT,
    "kind" TEXT NOT NULL,
    "scored" BOOLEAN NOT NULL DEFAULT true,
    "isPersonal" BOOLEAN NOT NULL DEFAULT false,
    "xpComplete" INTEGER,
    "xpMiss" INTEGER,
    "unitLabel" TEXT,
    "xpPerUnit" REAL,
    "xpCap" INTEGER,
    "missXp" INTEGER,
    "subPoints" JSONB,
    "tiers" JSONB,
    "deductMultiplier" REAL NOT NULL DEFAULT 2,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityLog" (
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
    CONSTRAINT "ActivityLog_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ActivityLog_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DayScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "xpDeducted" INTEGER NOT NULL DEFAULT 0,
    "netXp" INTEGER NOT NULL DEFAULT 0,
    "personalXp" INTEGER NOT NULL DEFAULT 0,
    "breakdown" JSONB NOT NULL,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DayScore_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Activity_groupId_idx" ON "Activity"("groupId");

-- CreateIndex
CREATE INDEX "Activity_ownerUserId_idx" ON "Activity"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_groupId_seedKey_key" ON "Activity"("groupId", "seedKey");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_activityId_date_idx" ON "ActivityLog"("userId", "activityId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityLog_challengeId_activityId_date_key" ON "ActivityLog"("challengeId", "activityId", "date");

-- CreateIndex
CREATE INDEX "DayScore_userId_date_idx" ON "DayScore"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DayScore_challengeId_date_key" ON "DayScore"("challengeId", "date");
