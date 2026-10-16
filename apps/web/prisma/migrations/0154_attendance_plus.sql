-- Stage 5 · Q11: attendance. Excuse requests (a student asks, with a reason and maybe a document;
-- a teacher or admin decides; approved ones mark the day Excused). A course's seating chart (JSON:
-- { rows, cols, seats: { "<row>-<col>": studentId } }). The school's optional location check for
-- class check-ins (the browser's position is compared with the campus and never stored).
-- enrollments.absenceAlertAt: when the student's guardians were last told about frequent absences
-- in that course (at most once a week).
CREATE TABLE "attendance_excuses" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "studentId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "date" DATETIME NOT NULL,
  "reason" TEXT NOT NULL,
  "fileUrl" TEXT,
  "fileName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "decidedById" TEXT,
  "decidedAt" DATETIME,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_excuses_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "attendance_excuses_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "attendance_excuses_courseId_status_idx" ON "attendance_excuses"("courseId", "status");
CREATE INDEX "attendance_excuses_studentId_idx" ON "attendance_excuses"("studentId");
ALTER TABLE "courses" ADD COLUMN "seating" TEXT;
ALTER TABLE "enrollments" ADD COLUMN "absenceAlertAt" DATETIME;
ALTER TABLE "school_policy" ADD COLUMN "checkinGeo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "school_policy" ADD COLUMN "checkinLat" REAL;
ALTER TABLE "school_policy" ADD COLUMN "checkinLng" REAL;
ALTER TABLE "school_policy" ADD COLUMN "checkinRadius" INTEGER NOT NULL DEFAULT 300;
