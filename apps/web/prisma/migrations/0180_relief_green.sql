-- Migration 0180: two new UniVerse Impact apps (the owner, 24 Oct 2026: "add more other types also
-- where they create a impact in the system or world").
-- UniVerse Relief: needs and offers of help on one live map (food, water, shelter, medical, transport,
-- clothes). Positions are kept to about 500 m so nobody's door can be found.
-- UniVerse Green: climate actions with the CO2 they save, teams with a join code, and a weekly
-- challenge (computed, not stored).

CREATE TABLE IF NOT EXISTS "relief_posts" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "details" TEXT,
  "people" INTEGER NOT NULL DEFAULT 1,
  "urgency" TEXT NOT NULL DEFAULT 'MEDIUM',
  "lat" REAL NOT NULL,
  "lng" REAL NOT NULL,
  "place" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "helperId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "takenAt" DATETIME,
  "doneAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "relief_posts_status_idx" ON "relief_posts"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "relief_posts_user_idx" ON "relief_posts"("userId");
CREATE INDEX IF NOT EXISTS "relief_posts_helper_idx" ON "relief_posts"("helperId");

CREATE TABLE IF NOT EXISTS "green_teams" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL UNIQUE,
  "ownerId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "green_members" (
  "teamId" TEXT NOT NULL REFERENCES "green_teams"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("teamId", "userId")
);
CREATE INDEX IF NOT EXISTS "green_members_user_idx" ON "green_members"("userId");

CREATE TABLE IF NOT EXISTS "green_actions" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "co2Kg" REAL NOT NULL,
  "note" TEXT,
  "lat" REAL,
  "lng" REAL,
  "place" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "green_actions_user_idx" ON "green_actions"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "green_actions_time_idx" ON "green_actions"("createdAt");
