-- Stage 5 · B8.9: "Don't show me in call recordings": the recorder draws this person's initials
-- instead of their camera (their voice is still recorded if they speak).
ALTER TABLE "users" ADD COLUMN "noRecording" BOOLEAN NOT NULL DEFAULT false;
-- And trimming a recording (seconds into the file): people watching see only that part.
ALTER TABLE "call_recordings" ADD COLUMN "trimStart" INTEGER;
ALTER TABLE "call_recordings" ADD COLUMN "trimEnd" INTEGER;
