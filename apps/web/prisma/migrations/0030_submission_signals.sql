-- Similarity signals for assignment answers (src/server/similarity.ts), for the teacher only.
ALTER TABLE "assignment_submissions" ADD COLUMN "signals" JSONB;
