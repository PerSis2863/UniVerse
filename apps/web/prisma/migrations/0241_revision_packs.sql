-- M294: revision packs. A course's teacher makes a pack from the course's own materials and class recaps (one AI
-- request, or a plain outline from the modules when AI isn't available): topics with summaries, key points and
-- terms, practice questions with answers, a checklist. Students see the published ones.
CREATE TABLE IF NOT EXISTS "revision_packs" (
  "id" TEXT PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "sources" TEXT NOT NULL DEFAULT '[]',
  "usedAi" BOOLEAN NOT NULL DEFAULT false,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "revision_packs_courseId_idx" ON "revision_packs" ("courseId");
