-- CreateTable
CREATE TABLE "owner_changes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "undoneAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "owner_changes_createdAt_idx" ON "owner_changes"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "owner_changes_model_recordId_idx" ON "owner_changes"("model", "recordId");

