-- CreateTable
CREATE TABLE "AccountabilityPair" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountabilityPair_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountabilityPair_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountabilityPair_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountabilityPair_requesterId_addresseeId_key" ON "AccountabilityPair"("requesterId", "addresseeId");

-- CreateIndex
CREATE INDEX "AccountabilityPair_groupId_status_idx" ON "AccountabilityPair"("groupId", "status");

-- CreateIndex
CREATE INDEX "AccountabilityPair_addresseeId_status_idx" ON "AccountabilityPair"("addresseeId", "status");
