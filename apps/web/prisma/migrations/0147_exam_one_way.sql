-- Exam mode extras (Stage 5 · B4.3): one question at a time with no going back (each answer is
-- saved on the server as the student moves on), and a hard stop (answers aren't taken after time).
ALTER TABLE "quizzes" ADD COLUMN "oneWay" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quizzes" ADD COLUMN "hardStop" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quiz_attempts" ADD COLUMN "answers" TEXT;
