-- Quiz question types (Stage 5 · B4.1): true or false, several answers, short answer, fill in the
-- blanks, matching, putting in order, numbers. `meta` holds the answer key as JSON (never sent to
-- students); older questions are one-answer multiple choice.
ALTER TABLE "quiz_questions" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'CHOICE';
ALTER TABLE "quiz_questions" ADD COLUMN "meta" TEXT;
ALTER TABLE "question_bank" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'CHOICE';
ALTER TABLE "question_bank" ADD COLUMN "meta" TEXT;
