-- Stage 4 · 2.9: recordings of calls that aren't classes (class recordings stay course materials).
CREATE TABLE "call_recordings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "callId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "conversationId" TEXT,
  "groupId" TEXT,
  "messageId" TEXT,
  "noteId" TEXT,
  "createdById" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL DEFAULT 0,
  "durationSec" INTEGER NOT NULL DEFAULT 0,
  "people" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "call_recordings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "call_recordings_callId_idx" ON "call_recordings"("callId");
CREATE INDEX "call_recordings_conversationId_idx" ON "call_recordings"("conversationId");
CREATE INDEX "call_recordings_groupId_idx" ON "call_recordings"("groupId");
CREATE INDEX "call_recordings_createdById_createdAt_idx" ON "call_recordings"("createdById", "createdAt");
