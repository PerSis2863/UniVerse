-- Stage 5 · D1: Learning DNA. A course's concepts (the teacher's list; AI can suggest one from the
-- course), and which quiz questions, question-bank items and rubric criteria test each concept.
-- Each student's mastery of each concept is worked out from their answers and rubric scores when
-- it's looked at (src/lib/mastery.ts), so nothing goes stale.
CREATE TABLE "course_concepts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "course_concepts_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_concepts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "course_concepts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "course_concepts_courseId_name_key" ON "course_concepts"("courseId", "name");

CREATE TABLE "concept_tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conceptId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "concept_tags_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "course_concepts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "concept_tags_kind_refId_conceptId_key" ON "concept_tags"("kind", "refId", "conceptId");
CREATE INDEX "concept_tags_refId_idx" ON "concept_tags"("refId");
