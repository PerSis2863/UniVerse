-- Stage 5 · B3.6: how a typed answer grew (src/lib/writing-replay.ts), handed in with it: JSON
-- { base, chunks: [{ t, p, d, i, paste? }] }; replayMatches: replaying it gives the answer handed in.
ALTER TABLE "assignment_submissions" ADD COLUMN "writingReplay" TEXT;
ALTER TABLE "assignment_submissions" ADD COLUMN "replayMatches" BOOLEAN;
