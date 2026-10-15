-- Stage 5 · B3.2: what students hand in: a written answer (TEXT, as before), a file (FILE: uploaded
-- here, with an optional note in "text") or a link (LINK: a web address, with an optional note).
ALTER TABLE "assignments" ADD COLUMN "submitKind" TEXT NOT NULL DEFAULT 'TEXT';
ALTER TABLE "assignment_submissions" ADD COLUMN "fileUrl" TEXT;
ALTER TABLE "assignment_submissions" ADD COLUMN "fileName" TEXT;
ALTER TABLE "assignment_submissions" ADD COLUMN "fileSize" INTEGER;
ALTER TABLE "assignment_submissions" ADD COLUMN "linkUrl" TEXT;
