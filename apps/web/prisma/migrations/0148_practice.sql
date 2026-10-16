-- Adaptive practice (Stage 5 · B4.4). A practice set is a quiz that's never graded: its questions
-- (and closed quizzes' questions) are practised any time, picked by what the student hasn't mastered.
ALTER TABLE "quizzes" ADD COLUMN "practice" BOOLEAN NOT NULL DEFAULT false;

-- Each question a student practised: the first try's share of the points (it counts towards
-- mastery) and how many tries it took.
CREATE TABLE "practice_answers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "credit" REAL NOT NULL,
    "tries" INTEGER NOT NULL DEFAULT 1,
    "solved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "practice_answers_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "practice_answers_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "practice_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "quiz_questions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "practice_answers_studentId_courseId_idx" ON "practice_answers"("studentId", "courseId");
CREATE INDEX "practice_answers_questionId_idx" ON "practice_answers"("questionId");
