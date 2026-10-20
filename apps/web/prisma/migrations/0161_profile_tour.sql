-- Stage 5 · Q18 Onboarding, profile and settings: a richer profile (cover photo, pronouns, about,
-- links, availability) and the guided tour's saved progress.
ALTER TABLE "users" ADD COLUMN "coverUrl" TEXT;
ALTER TABLE "users" ADD COLUMN "pronouns" TEXT;
ALTER TABLE "users" ADD COLUMN "bio" TEXT;
ALTER TABLE "users" ADD COLUMN "links" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "users" ADD COLUMN "availability" TEXT;
ALTER TABLE "users" ADD COLUMN "tourStep" INTEGER NOT NULL DEFAULT 0;
