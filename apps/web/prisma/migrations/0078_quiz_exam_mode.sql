-- Stage 5 · B4.3–4.4: quizzes can shuffle questions and options per student, and run in exam
-- mode: the time limit counts from when the student started on the server (quiz_attempts), and
-- the submission keeps an integrity note for the teacher (times the student left the quiz, pasted,
-- left full screen, and how long past the time limit it arrived). No webcam, no screen capture.
ALTER TABLE "quizzes" ADD COLUMN "shuffle" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quizzes" ADD COLUMN "examMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quiz_submissions" ADD COLUMN "integrity" JSONB;

CREATE TABLE "quiz_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quizId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quiz_attempts_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "quiz_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_quizId_studentId_key" ON "quiz_attempts"("quizId", "studentId");
