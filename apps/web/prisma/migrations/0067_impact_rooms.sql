-- Stage 4 · 4.12: impact rooms. Each NGO project gets a room where volunteers, sponsors and students
-- meet: live updates, followers, donations of time (pledged hours, checked against verified shift
-- hours), and a monthly live "impact call" with a report for sponsors. A room can also have a
-- public page (/impact/<project>) that shows figures, staff updates and reports, never students.
ALTER TABLE "ngo_projects" ADD COLUMN "roomPublic" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "impact_updates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'UPDATE',
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "callId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "impact_updates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ngo_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "impact_updates_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "impact_updates_projectId_createdAt_idx" ON "impact_updates"("projectId", "createdAt");
CREATE INDEX "impact_updates_authorId_idx" ON "impact_updates"("authorId");
CREATE TABLE "impact_followers" (
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'SUPPORTER',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("projectId", "userId"),
  CONSTRAINT "impact_followers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ngo_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "impact_followers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "impact_followers_userId_idx" ON "impact_followers"("userId");
CREATE TABLE "time_pledges" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "hoursPerMonth" INTEGER NOT NULL,
  "months" INTEGER NOT NULL DEFAULT 3,
  "skill" TEXT,
  "note" TEXT,
  "startAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "time_pledges_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ngo_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "time_pledges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "time_pledges_projectId_userId_key" ON "time_pledges"("projectId", "userId");
CREATE INDEX "time_pledges_userId_idx" ON "time_pledges"("userId");
CREATE TABLE "impact_calls" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "startsAt" DATETIME NOT NULL,
  "title" TEXT NOT NULL,
  "report" JSONB,
  "reportAt" DATETIME,
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "impact_calls_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ngo_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "impact_calls_projectId_startsAt_idx" ON "impact_calls"("projectId", "startsAt");
