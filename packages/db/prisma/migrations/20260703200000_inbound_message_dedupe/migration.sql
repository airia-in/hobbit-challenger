-- CreateTable
CREATE TABLE "InboundMessageDedupe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessageDedupe_messageId_key" ON "InboundMessageDedupe"("messageId");

-- CreateIndex
CREATE INDEX "InboundMessageDedupe_createdAt_idx" ON "InboundMessageDedupe"("createdAt");
