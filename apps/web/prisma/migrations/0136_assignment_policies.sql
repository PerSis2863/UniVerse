-- Stage 5 · B3.1: assignment rules (src/lib/assignment-policy.ts).
-- A late penalty: % lost per started day after a grace period, up to a maximum (null: none).
ALTER TABLE "assignments" ADD COLUMN "latePenalty" REAL;
ALTER TABLE "assignments" ADD COLUMN "lateGraceMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "assignments" ADD COLUMN "latePenaltyMax" REAL NOT NULL DEFAULT 100;
-- How many times a student may hand in before it's graded (null: any number).
ALTER TABLE "assignments" ADD COLUMN "maxAttempts" INTEGER;

-- On each submission: its attempt number, how late it was and the % that comes off when it's graded
-- (unless the teacher waives it), and the rubric total before the penalty.
ALTER TABLE "assignment_submissions" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "assignment_submissions" ADD COLUMN "lateDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "assignment_submissions" ADD COLUMN "latePenalty" REAL NOT NULL DEFAULT 0;
ALTER TABLE "assignment_submissions" ADD COLUMN "lateWaived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "assignment_submissions" ADD COLUMN "rawScore" REAL;

-- An extension for one student: their own due date, and extra attempts.
CREATE TABLE "assignment_extensions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "extraAttempts" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assignment_extensions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assignment_extensions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "assignment_extensions_assignmentId_studentId_key" ON "assignment_extensions"("assignmentId", "studentId");
CREATE INDEX "assignment_extensions_studentId_idx" ON "assignment_extensions"("studentId");

-- Accommodations, set once per student and used in every course: extra days on assignment due dates
-- and extra time (%) on timed quizzes. The note is for staff only.
CREATE TABLE "student_accommodations" (
    "studentId" TEXT NOT NULL PRIMARY KEY,
    "extraDays" INTEGER NOT NULL DEFAULT 0,
    "extraTimePct" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_accommodations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
