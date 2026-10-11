-- Stage 5 · B8.1: the rating people give a call afterwards (1–5) and what went wrong
-- (comma-separated: audio, video, lag, dropped, join), on their call health report.
ALTER TABLE "call_stats" ADD COLUMN "rating" INTEGER;
ALTER TABLE "call_stats" ADD COLUMN "issues" TEXT;
