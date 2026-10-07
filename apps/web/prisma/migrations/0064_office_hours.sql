-- Stage 4 · 4.7: office hours with a queue. Whether a teacher's office hours are open (until when,
-- about what, when their students were last told they opened), and the teacher's private notes about
-- a student's visit.
CREATE TABLE "office_hours" (
  "teacherId" TEXT NOT NULL PRIMARY KEY,
  "open" BOOLEAN NOT NULL DEFAULT false,
  "until" DATETIME,
  "topic" TEXT,
  "notifiedAt" DATETIME,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "office_hours_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "office_hours_open_until_idx" ON "office_hours"("open", "until");
CREATE TABLE "office_notes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "teacherId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "office_notes_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "office_notes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "office_notes_teacherId_createdAt_idx" ON "office_notes"("teacherId", "createdAt");
CREATE INDEX "office_notes_teacherId_studentId_idx" ON "office_notes"("teacherId", "studentId");
