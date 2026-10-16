-- Stage 5 · B3.4: grades held until the teacher posts them, and a history of grade changes.
-- postPolicy: AUTO (a grade shows when it's returned, as before) or MANUAL (returned grades wait
-- until "Post grades"). A hand-in's postedAt: when its grade reached the gradebook and the student
-- (grades returned before this change were shown at once).
ALTER TABLE "assignments" ADD COLUMN "postPolicy" TEXT NOT NULL DEFAULT 'AUTO';
ALTER TABLE "assignment_submissions" ADD COLUMN "postedAt" DATETIME;
UPDATE "assignment_submissions" SET "postedAt" = "returnedAt" WHERE "status" IN ('RETURNED', 'REOPENED');

-- Who changed which grade, from what to what (newScore null: deleted). Kept when the grade goes.
CREATE TABLE "grade_changes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "gradeId" TEXT,
    "assessment" TEXT NOT NULL,
    "oldScore" REAL,
    "newScore" REAL,
    "maxScore" REAL NOT NULL,
    "changedById" TEXT,
    "changedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "grade_changes_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "grade_changes_courseId_createdAt_idx" ON "grade_changes"("courseId", "createdAt");
CREATE INDEX "grade_changes_studentId_idx" ON "grade_changes"("studentId");
