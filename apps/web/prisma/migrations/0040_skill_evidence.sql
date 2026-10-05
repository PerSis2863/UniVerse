-- Upgrade 2, proof-of-learning passport: skills backed by evidence (graded assignments, passed
-- quizzes, issued impact credentials), the skills each course builds, and an editable strengths
-- paragraph on the passport.
CREATE TABLE "skill_evidence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "skill" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT,
  "level" TEXT,
  "verifiedById" TEXT,
  "verifiedByName" TEXT,
  "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "skill_evidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "skill_evidence_userId_kind_sourceId_skill_key" ON "skill_evidence"("userId", "kind", "sourceId", "skill");
CREATE INDEX "skill_evidence_userId_skill_idx" ON "skill_evidence"("userId", "skill");
ALTER TABLE "courses" ADD COLUMN "skills" TEXT;
ALTER TABLE "skill_passports" ADD COLUMN "showEvidence" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "skill_passports" ADD COLUMN "strengths" TEXT;
ALTER TABLE "skill_passports" ADD COLUMN "strengthsAt" DATETIME;
