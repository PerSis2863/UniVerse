-- Stage 4 · 1.4: drafts that follow you between devices, and messages scheduled to send later.
ALTER TABLE "conversation_participants" ADD COLUMN "draft" TEXT;
ALTER TABLE "conversation_participants" ADD COLUMN "draftAt" DATETIME;
CREATE TABLE "scheduled_messages" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "replyToId" TEXT,
  "sendAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scheduled_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "scheduled_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "scheduled_messages_sendAt_idx" ON "scheduled_messages"("sendAt");
CREATE INDEX "scheduled_messages_conversationId_senderId_idx" ON "scheduled_messages"("conversationId", "senderId");
