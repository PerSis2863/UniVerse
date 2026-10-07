-- Stage 4 · 4.4: the classroom pulse over a class ("I'm lost" / "Got it" counts, never names), and
-- what the AI suggests re-explaining (for the teacher).
ALTER TABLE "class_sessions" ADD COLUMN "pulse" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "class_sessions" ADD COLUMN "reexplain" TEXT NOT NULL DEFAULT '[]';
