-- Upgrade 1, AI class companion: a class call with "Class notes" on becomes a study pack (summary,
-- notes, key moments, flashcards, a draft quiz). The transcript is text only and is deleted after
-- 90 days by the daily job.
CREATE TABLE "class_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL,
  "durationSec" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "summary" TEXT,
  "notes" TEXT NOT NULL DEFAULT '[]',
  "keyMoments" TEXT NOT NULL DEFAULT '[]',
  "flashcards" TEXT NOT NULL DEFAULT '[]',
  "quizId" TEXT,
  "recordingMaterialId" TEXT,
  "transcript" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "class_sessions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "class_sessions_courseId_createdAt_idx" ON "class_sessions"("courseId", "createdAt");
