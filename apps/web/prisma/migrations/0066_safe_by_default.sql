-- Stage 4 · 4.10: safe by default for young students. The school's safety policy (one row, "main"),
-- quiet hours per person (no pushes during them), and chat messages the safety check flagged for
-- the school's moderators (never shown to anyone else).
CREATE TABLE "school_policy" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guard" BOOLEAN NOT NULL DEFAULT true,
  "recordMinors" BOOLEAN NOT NULL DEFAULT false,
  "quietMinors" BOOLEAN NOT NULL DEFAULT true,
  "quietStart" TEXT NOT NULL DEFAULT '22:00',
  "quietEnd" TEXT NOT NULL DEFAULT '07:00',
  "studentsMinors" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" TEXT
);
CREATE TABLE "quiet_hours" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "on" BOOLEAN NOT NULL DEFAULT true,
  "start" TEXT NOT NULL DEFAULT '22:00',
  "end" TEXT NOT NULL DEFAULT '07:00',
  "timeZone" TEXT NOT NULL DEFAULT 'UTC',
  "bySchool" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quiet_hours_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "quiet_hours_bySchool_idx" ON "quiet_hours"("bySchool");
CREATE TABLE "safety_flags" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "messageId" TEXT,
  "conversationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "reason" TEXT,
  "excerpt" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "repeats" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "reviewedById" TEXT,
  "reviewedAt" DATETIME,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "safety_flags_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "safety_flags_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "safety_flags_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "safety_flags_status_createdAt_idx" ON "safety_flags"("status", "createdAt");
CREATE INDEX "safety_flags_conversationId_createdAt_idx" ON "safety_flags"("conversationId", "createdAt");
CREATE INDEX "safety_flags_senderId_idx" ON "safety_flags"("senderId");
