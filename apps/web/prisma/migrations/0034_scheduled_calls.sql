-- Calls booked ahead (src/server/scheduled-calls.ts) for a class, a study group or a chat.
CREATE TABLE "scheduled_calls" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'video',
  "startAt" DATETIME NOT NULL,
  "durationMin" INTEGER NOT NULL DEFAULT 60,
  "courseId" TEXT,
  "groupId" TEXT,
  "conversationId" TEXT,
  "callId" TEXT,
  "calendarEventId" TEXT,
  "createdById" TEXT,
  "remindedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scheduled_calls_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "scheduled_calls_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "scheduled_calls_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "scheduled_calls_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "scheduled_calls_startAt_idx" ON "scheduled_calls"("startAt");
CREATE INDEX "scheduled_calls_courseId_idx" ON "scheduled_calls"("courseId");
CREATE INDEX "scheduled_calls_groupId_idx" ON "scheduled_calls"("groupId");
CREATE INDEX "scheduled_calls_conversationId_idx" ON "scheduled_calls"("conversationId");
CREATE INDEX "scheduled_calls_createdById_idx" ON "scheduled_calls"("createdById");
