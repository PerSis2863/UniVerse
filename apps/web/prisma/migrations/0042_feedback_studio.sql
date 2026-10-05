-- Upgrade 8, feedback studio: recorded voice/video feedback on a submission (with an optional
-- transcript) and writing-style signals compared with the student's own earlier answers.
ALTER TABLE "assignment_submissions" ADD COLUMN "feedbackMediaUrl" TEXT;
ALTER TABLE "assignment_submissions" ADD COLUMN "feedbackMediaKind" TEXT;
ALTER TABLE "assignment_submissions" ADD COLUMN "feedbackTranscript" TEXT;
ALTER TABLE "assignment_submissions" ADD COLUMN "styleSignals" JSONB;
