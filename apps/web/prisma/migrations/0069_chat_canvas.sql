-- Stage 4 · 1.12: a chat's canvas, a live document pinned to a group chat or channel (one per chat).
ALTER TABLE "docs" ADD COLUMN "conversationId" TEXT;
CREATE UNIQUE INDEX "docs_conversationId_key" ON "docs"("conversationId");
