-- Stage 4 · 4.6: smart replay for each class (chapters, a two-minute recap, practice questions).
ALTER TABLE "class_sessions" ADD COLUMN "chapters" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "class_sessions" ADD COLUMN "recap" TEXT;
ALTER TABLE "class_sessions" ADD COLUMN "practice" TEXT NOT NULL DEFAULT '[]';
