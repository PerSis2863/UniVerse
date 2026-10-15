-- Stage 5 · B2: a class-size limit (capacity: null for no limit) and sections inside a course.
-- When a course is full, students asking to join wait (elective_requests with status WAITLISTED, no
-- schema change: the status column is text) and are let in, oldest first, as places free up.
ALTER TABLE "courses" ADD COLUMN "capacity" INTEGER;

CREATE TABLE "course_sections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "course_sections_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "course_sections_courseId_name_key" ON "course_sections"("courseId", "name");

-- A student's section in a course (null: none).
ALTER TABLE "enrollments" ADD COLUMN "sectionId" TEXT REFERENCES "course_sections" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "enrollments_sectionId_idx" ON "enrollments"("sectionId");
