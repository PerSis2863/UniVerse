-- Question pools (Stage 5 · B4.2): a question's pool, how many each student gets from each pool,
-- and which questions a student got (their own draw).
ALTER TABLE "quizzes" ADD COLUMN "pools" TEXT;
ALTER TABLE "quiz_questions" ADD COLUMN "pool" TEXT;
ALTER TABLE "quiz_submissions" ADD COLUMN "drawn" TEXT;
