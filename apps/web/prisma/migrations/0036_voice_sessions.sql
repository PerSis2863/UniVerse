-- Voice tutor sessions: who, which course, how long, and the conversation as text (never the
-- audio), shown in the owner console. Deleted after 90 days by the daily job.
CREATE TABLE "voice_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "courseId" TEXT,
  "durationSec" INTEGER NOT NULL,
  "turns" INTEGER NOT NULL DEFAULT 0,
  "transcript" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "voice_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "voice_sessions_createdAt_idx" ON "voice_sessions"("createdAt");
CREATE INDEX "voice_sessions_userId_idx" ON "voice_sessions"("userId");
