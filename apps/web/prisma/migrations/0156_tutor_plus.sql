-- Stage 5 · Q13: the teacher's rule for a course's AI tutor (JSON: hints only, an instruction, off
-- until a time), FSRS numbers for flashcards, the evening flashcard reminder, and the course's
-- questions to the tutor found quickly for the teacher's view of common questions.
ALTER TABLE "courses" ADD COLUMN "tutorRule" TEXT;
ALTER TABLE "study_cards" ADD COLUMN "stability" REAL;
ALTER TABLE "study_cards" ADD COLUMN "difficulty" REAL;
ALTER TABLE "study_cards" ADD COLUMN "lastReview" DATETIME;
ALTER TABLE "users" ADD COLUMN "cardsRemindAt" DATETIME;
CREATE INDEX "users_cardsRemindAt_idx" ON "users"("cardsRemindAt");
CREATE INDEX "ai_uses_courseId_createdAt_idx" ON "ai_uses"("courseId", "createdAt");
