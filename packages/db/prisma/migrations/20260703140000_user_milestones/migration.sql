-- Curated milestone achievements: one unlock per user per milestone key.
CREATE TABLE "UserMilestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT,
    "milestoneKey" TEXT NOT NULL,
    "unlockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserMilestone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserMilestone_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserMilestone_userId_milestoneKey_key" ON "UserMilestone"("userId", "milestoneKey");
CREATE INDEX "UserMilestone_userId_unlockedAt_idx" ON "UserMilestone"("userId", "unlockedAt");
