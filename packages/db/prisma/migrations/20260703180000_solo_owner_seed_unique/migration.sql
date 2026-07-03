-- CreateIndex
CREATE UNIQUE INDEX "Activity_ownerUserId_seedKey_key" ON "Activity"("ownerUserId", "seedKey");
