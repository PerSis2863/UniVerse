-- Stage 4 · 4.9: daily brief. Per person: whether the morning push is on, their time zone and the
-- hour it comes, when the next one is due (in UTC, so the 15-minute cron checks one indexed column),
-- and today's AI brief (one AI request per person per day, made when they first open it).
CREATE TABLE "daily_briefs" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "push" BOOLEAN NOT NULL DEFAULT true,
  "timeZone" TEXT NOT NULL DEFAULT 'UTC',
  "hour" INTEGER NOT NULL DEFAULT 7,
  "nextAt" DATETIME,
  "sentAt" DATETIME,
  "aiDay" TEXT,
  "ai" TEXT,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_briefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "daily_briefs_push_nextAt_idx" ON "daily_briefs"("push", "nextAt");
