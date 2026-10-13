-- Stage 5 · D11: AI viva and oral-exam coach. A teacher's oral check for a course (what to ask, the
-- rubric, how long, until when), and each oral a student did: practice on their own, or their one
-- attempt at a check (the conversation as text, their recorded voice for a check, the AI's draft
-- scores, and the teacher's confirmed scores and comment).
CREATE TABLE "oral_checks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'VIVA',
    "topic" TEXT NOT NULL,
    "questions" TEXT NOT NULL DEFAULT '',
    "lang" TEXT NOT NULL DEFAULT '',
    "rubric" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 8,
    "dueAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oral_checks_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "oral_checks_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "oral_checks_courseId_idx" ON "oral_checks"("courseId");

CREATE TABLE "oral_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "courseId" TEXT,
    "checkId" TEXT,
    "kind" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT '',
    "rubric" TEXT NOT NULL,
    "transcript" TEXT NOT NULL DEFAULT '[]',
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "audioUrl" TEXT,
    "aiScores" TEXT,
    "aiSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PRACTICE',
    "finalScores" TEXT,
    "teacherComment" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oral_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "oral_sessions_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "oral_checks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "oral_sessions_checkId_userId_key" ON "oral_sessions"("checkId", "userId");
CREATE INDEX "oral_sessions_userId_createdAt_idx" ON "oral_sessions"("userId", "createdAt");
