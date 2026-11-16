-- M216: UniVerse Green's second wave: a person's footprint results over time, a monthly goal and pledges
-- (habits checked off by day), and community events (clean-ups, tree plantings, repair cafés, swaps) with
-- who's going and reports (three hide an event).

CREATE TABLE IF NOT EXISTS "green_footprints" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "answers" TEXT NOT NULL,
  "kg" REAL NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "green_footprints_userId_idx" ON "green_footprints" ("userId");

CREATE TABLE IF NOT EXISTS "green_goals" (
  "userId" TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "monthlyKg" REAL NOT NULL,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "green_pledges" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tip" TEXT NOT NULL,
  "days" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "green_pledges_userId_tip_key" ON "green_pledges" ("userId", "tip");

CREATE TABLE IF NOT EXISTS "green_events" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'cleanup',
  "date" TEXT NOT NULL,
  "time" TEXT,
  "place" TEXT NOT NULL,
  "lat" REAL,
  "lng" REAL,
  "details" TEXT,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "green_events_date_idx" ON "green_events" ("date");

CREATE TABLE IF NOT EXISTS "green_event_going" (
  "eventId" TEXT NOT NULL REFERENCES "green_events"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("eventId", "userId")
);
CREATE INDEX IF NOT EXISTS "green_event_going_userId_idx" ON "green_event_going" ("userId");

CREATE TABLE IF NOT EXISTS "green_event_reports" (
  "eventId" TEXT NOT NULL REFERENCES "green_events"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("eventId", "userId")
);
