-- Stage 5 · D9 (second part): a teacher can correct a simpler version (who and when, so students
-- see "checked by your teacher"), and choose per quiz whether students may see its questions in
-- simpler words or their language and listen to them (on unless the teacher turns it off).
ALTER TABLE "leveled_texts" ADD COLUMN "editedById" TEXT;
ALTER TABLE "leveled_texts" ADD COLUMN "editedAt" DATETIME;
ALTER TABLE "quizzes" ADD COLUMN "plainWords" BOOLEAN NOT NULL DEFAULT true;
