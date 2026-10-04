-- Live polls during class (src/server/live.ts): the teacher asks, students answer on their
-- phones, results update live.
CREATE TABLE "live_polls" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL,
  "createdById" TEXT,
  "question" TEXT NOT NULL,
  "options" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "showResults" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" DATETIME,
  CONSTRAINT "live_polls_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "live_polls_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "live_polls_courseId_status_idx" ON "live_polls"("courseId", "status");
CREATE INDEX "live_polls_createdById_idx" ON "live_polls"("createdById");
CREATE TABLE "live_poll_votes" (
  "pollId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "option" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("pollId", "userId"),
  CONSTRAINT "live_poll_votes_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "live_polls" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "live_poll_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "live_poll_votes_userId_idx" ON "live_poll_votes"("userId");
