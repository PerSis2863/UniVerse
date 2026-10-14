-- Stage 5 · D16, the parent co-pilot: each parent's language and weekly summary settings, the weekly
-- summaries made for them (one per child, week and language), and the questions they asked about
-- their child (answered from the school's records, never from messages).
CREATE TABLE "parent_copilot" (
  "guardianId" TEXT NOT NULL PRIMARY KEY,
  "lang" TEXT NOT NULL DEFAULT 'en',
  "weekly" BOOLEAN NOT NULL DEFAULT true,
  "weekday" INTEGER NOT NULL DEFAULT 6,
  "hour" INTEGER NOT NULL DEFAULT 18,
  "timeZone" TEXT NOT NULL DEFAULT 'UTC',
  "nextAt" DATETIME,
  "sentAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "parent_copilot_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "parent_copilot_weekly_nextAt_idx" ON "parent_copilot"("weekly", "nextAt");
CREATE TABLE "parent_summaries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guardianId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "week" TEXT NOT NULL,
  "lang" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "ai" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parent_summaries_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "parent_summaries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "parent_summaries_guardianId_studentId_week_lang_key" ON "parent_summaries"("guardianId", "studentId", "week", "lang");
CREATE INDEX "parent_summaries_studentId_idx" ON "parent_summaries"("studentId");
CREATE TABLE "parent_questions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guardianId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "lang" TEXT NOT NULL,
  "used" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parent_questions_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "parent_questions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "parent_questions_guardianId_studentId_createdAt_idx" ON "parent_questions"("guardianId", "studentId", "createdAt");
CREATE INDEX "parent_questions_studentId_idx" ON "parent_questions"("studentId");
