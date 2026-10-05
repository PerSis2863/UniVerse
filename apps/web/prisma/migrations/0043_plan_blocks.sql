-- Upgrade 6, smart study planner: study sessions placed in the student's free time, and the
-- student's planner settings (daily cap, study hours, calendar feed opt-in).
CREATE TABLE "plan_blocks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "start" TEXT NOT NULL,
  "end" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "refId" TEXT,
  "title" TEXT NOT NULL,
  "courseCode" TEXT,
  "done" BOOLEAN NOT NULL DEFAULT false,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "movedFrom" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_blocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "plan_blocks_userId_date_idx" ON "plan_blocks"("userId", "date");
ALTER TABLE "users" ADD COLUMN "studyPrefs" TEXT;
