-- At most one ACTIVE pair per user as requester or addressee (#178).
CREATE UNIQUE INDEX "AccountabilityPair_requesterId_active_key" ON "AccountabilityPair"("requesterId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "AccountabilityPair_addresseeId_active_key" ON "AccountabilityPair"("addresseeId") WHERE "status" = 'ACTIVE';

-- Speed up hasActivePair requester-side lookups.
CREATE INDEX "AccountabilityPair_requesterId_status_idx" ON "AccountabilityPair"("requesterId", "status");
