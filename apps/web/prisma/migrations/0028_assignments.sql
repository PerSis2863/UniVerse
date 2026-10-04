-- Written assignments with a rubric, graded with an AI draft that the teacher reviews
-- (src/server/assignments.ts). Approving a grade writes an ordinary row in "grades".
CREATE TABLE "assignments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL,
  "createdById" TEXT,
  "title" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "rubric" JSONB NOT NULL,
  "maxScore" REAL NOT NULL,
  "weight" REAL NOT NULL DEFAULT 1,
  "dueDate" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "assignments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "assignments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "assignments_courseId_idx" ON "assignments"("courseId");
CREATE INDEX "assignments_createdById_idx" ON "assignments"("createdById");

CREATE TABLE "assignment_submissions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assignmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "aiDraft" JSONB,
  "aiDraftedAt" DATETIME,
  "criteriaScores" JSONB,
  "score" REAL,
  "feedback" TEXT,
  "gradeId" TEXT,
  "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "returnedAt" DATETIME,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "assignment_submissions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "assignment_submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "assignment_submissions_assignmentId_studentId_key" ON "assignment_submissions"("assignmentId", "studentId");
CREATE INDEX "assignment_submissions_studentId_idx" ON "assignment_submissions"("studentId");
