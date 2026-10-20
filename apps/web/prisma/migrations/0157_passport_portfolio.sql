-- Stage 5 · Q14: public portfolio handle and theme for the skills passport.
ALTER TABLE "skill_passports" ADD COLUMN "handle" TEXT;
ALTER TABLE "skill_passports" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'indigo';
CREATE UNIQUE INDEX "skill_passports_handle_key" ON "skill_passports"("handle");
