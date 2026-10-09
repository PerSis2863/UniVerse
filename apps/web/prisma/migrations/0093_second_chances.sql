-- Stage 5 · D10: second chances. When a student misses quiz questions or scores low on a rubric
-- criterion, they can open a short catch-up for that concept (or that question, if it isn't tagged):
-- the class moments where it was explained, a few practice questions, the missed questions again and
-- flashcards. "key" is CONCEPT:<concept id>, QUESTION:<question id> or CRITERION:<assignment id>:<criterion id>.
-- "plan" holds what was built (JSON), "results" the practice answers [{ at, right, w }], which count
-- towards the concept's mastery (src/server/learning-dna.ts).
CREATE TABLE "second_chances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "conceptId" TEXT,
    "topic" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "plan" TEXT,
    "results" TEXT,
    "watched" BOOLEAN NOT NULL DEFAULT false,
    "cards" BOOLEAN NOT NULL DEFAULT false,
    "missedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "second_chances_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "second_chances_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "second_chances_studentId_courseId_key_key" ON "second_chances"("studentId", "courseId", "key");
CREATE INDEX "second_chances_courseId_conceptId_idx" ON "second_chances"("courseId", "conceptId");
