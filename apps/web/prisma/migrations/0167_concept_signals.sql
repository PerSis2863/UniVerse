-- Stage 5 · Q22 (D1 leftover): more signals for the mastery map. A flashcard review (an outcome the
-- student gave themselves, counted lightly) and a question asked to the course tutor (no outcome:
-- "asked about recursion 4 times"), each for the course concept its words match. A card remembers
-- the concept it was matched to.
CREATE TABLE "concept_signals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "outcome" REAL,
    "refId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "concept_signals_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "concept_signals_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "concept_signals_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "course_concepts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "concept_signals_courseId_studentId_idx" ON "concept_signals"("courseId", "studentId");
ALTER TABLE "study_cards" ADD COLUMN "conceptId" TEXT;
