-- Algorithm-based proof rules per activity (replaces AI verification gating).
ALTER TABLE "Activity" ADD COLUMN "allowsProof" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Activity" ADD COLUMN "autoCompleteOnProof" BOOLEAN NOT NULL DEFAULT false;

-- Builtin defaults: progress photo auto-completes on upload; diet disallows proof.
UPDATE "Activity" SET "allowsProof" = true, "autoCompleteOnProof" = true WHERE "seedKey" = 'PROGRESS_PHOTO';
UPDATE "Activity" SET "allowsProof" = false, "autoCompleteOnProof" = false WHERE "seedKey" = 'DIET';
UPDATE "Activity"
SET "allowsProof" = true, "autoCompleteOnProof" = false
WHERE "seedKey" IS NOT NULL
  AND "seedKey" NOT IN ('PROGRESS_PHOTO', 'DIET');
