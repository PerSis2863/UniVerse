-- Study streaks (src/server/streaks.ts): one row per student per day they studied, and the
-- running streak on the account so dashboards read it without counting days.
CREATE TABLE "study_days" (
  "userId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "actions" INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY ("userId", "day"),
  CONSTRAINT "study_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "users" ADD COLUMN "streakCurrent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "streakBest" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "streakLastDay" TEXT;
