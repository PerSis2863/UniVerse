-- Migration 0116: Lecture to Everything: Micro-Lessons, Audio Recaps & Revision Reels (Stage 5 · D3)
-- Automatically transforms lecture recordings and study packs into 5-minute audio recaps,
-- vertical chapter-cut revision reels with burned-in captions, visual mind maps, and practice quizzes.

CREATE TABLE IF NOT EXISTS "lecture_micro_lessons" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL UNIQUE REFERENCES "class_sessions"("id") ON DELETE CASCADE,
  "courseId" TEXT NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "audioRecapUrl" TEXT,
  "audioRecapDurationSec" INTEGER NOT NULL DEFAULT 300,
  "audioRecapScript" TEXT NOT NULL,
  "audioRecapStatus" TEXT NOT NULL DEFAULT 'READY',
  "mindMap" TEXT NOT NULL DEFAULT '{}',
  "reels" TEXT NOT NULL DEFAULT '[]',
  "practiceQuiz" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'READY',
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "lecture_micro_lessons_session_idx" ON "lecture_micro_lessons"("sessionId");
CREATE INDEX IF NOT EXISTS "lecture_micro_lessons_course_idx" ON "lecture_micro_lessons"("courseId");
CREATE INDEX IF NOT EXISTS "lecture_micro_lessons_status_idx" ON "lecture_micro_lessons"("status");
