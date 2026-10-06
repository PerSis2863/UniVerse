-- Stage 4 · 2.8: meeting notes for every call (class calls keep their study packs in class_sessions).
CREATE TABLE "call_notes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "callId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "conversationId" TEXT,
  "groupId" TEXT,
  "messageId" TEXT,
  "createdById" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL,
  "durationSec" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "summary" TEXT,
  "decisions" TEXT NOT NULL DEFAULT '[]',
  "actions" TEXT NOT NULL DEFAULT '[]',
  "chapters" TEXT NOT NULL DEFAULT '[]',
  "transcript" TEXT,
  "people" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "call_notes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "call_notes_callId_idx" ON "call_notes"("callId");
CREATE INDEX "call_notes_conversationId_idx" ON "call_notes"("conversationId");
CREATE INDEX "call_notes_groupId_idx" ON "call_notes"("groupId");
CREATE INDEX "call_notes_createdById_createdAt_idx" ON "call_notes"("createdById", "createdAt");
