-- Stage 5 · Q22 (D12 leftovers): AI receipts on quizzes and oral checks. Each quiz and oral check has
-- the same AI rule as assignments (FREE, RECEIPT, NONE); a quiz answer and an oral attempt keep the
-- receipt or declaration the student gave (JSON, as assignment_submissions.aiReceipt).
ALTER TABLE "quizzes" ADD COLUMN "aiPolicy" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "quiz_submissions" ADD COLUMN "aiReceipt" TEXT;
ALTER TABLE "oral_checks" ADD COLUMN "aiPolicy" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "oral_sessions" ADD COLUMN "aiReceipt" TEXT;
