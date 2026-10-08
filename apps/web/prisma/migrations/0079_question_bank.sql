-- Stage 5 · B4.1: a course's question bank. Reusable multiple-choice questions with tags and a
-- difficulty, imported from CSV or saved from quizzes, and added to any quiz of the course.
CREATE TABLE "question_bank" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "points" REAL NOT NULL DEFAULT 1,
    "tags" TEXT NOT NULL DEFAULT '',
    "difficulty" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "question_bank_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "question_bank_courseId_idx" ON "question_bank"("courseId");
