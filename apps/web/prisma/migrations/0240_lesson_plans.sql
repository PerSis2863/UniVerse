-- M293: the term lesson planner. One row per planned class of a course (its day and timetable slot): the topic,
-- goals, homework and the course materials it uses; `eventId` is the calendar event students see for it.
CREATE TABLE IF NOT EXISTS "lesson_plans" (
  "id" TEXT PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "day" TEXT NOT NULL,
  "slotId" TEXT NOT NULL,
  "startAt" DATETIME,
  "endAt" DATETIME,
  "topic" TEXT NOT NULL,
  "goals" TEXT,
  "homework" TEXT,
  "materialIds" TEXT NOT NULL DEFAULT '[]',
  "done" BOOLEAN NOT NULL DEFAULT false,
  "eventId" TEXT,
  "createdById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "lesson_plans_courseId_day_slotId_key" ON "lesson_plans" ("courseId", "day", "slotId");
