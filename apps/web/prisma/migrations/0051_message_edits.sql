-- Stage 4 · 1.3: earlier versions of edited messages ("edited" → tap to see them).
CREATE TABLE "message_edits" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "messageId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "writtenAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_edits_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "message_edits_messageId_idx" ON "message_edits"("messageId");
