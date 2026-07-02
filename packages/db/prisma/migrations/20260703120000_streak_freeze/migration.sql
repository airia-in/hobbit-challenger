-- Streak freeze ("rain cloak"): inventory + grant dedupe.
ALTER TABLE "Challenge" ADD COLUMN "streakFreezesAvailable" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Challenge" ADD COLUMN "streakFreezesUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Challenge" ADD COLUMN "lastStreakFreezeGrantedAt" DATETIME;
