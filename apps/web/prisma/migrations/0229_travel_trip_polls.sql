-- M243: a trip's group polls: the people planning it vote on places, dates and stays (one or several choices
-- each). A vote is one row per choice; voting again replaces your rows. Everything goes with its trip.

CREATE TABLE IF NOT EXISTS "travel_trip_polls" (
  "id" TEXT PRIMARY KEY,
  "tripId" TEXT NOT NULL REFERENCES "travel_trips"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL DEFAULT 'other',
  "question" TEXT NOT NULL,
  "options" TEXT NOT NULL,
  "multi" BOOLEAN NOT NULL DEFAULT false,
  "closed" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "travel_trip_polls_tripId_idx" ON "travel_trip_polls" ("tripId");

CREATE TABLE IF NOT EXISTS "travel_trip_votes" (
  "pollId" TEXT NOT NULL REFERENCES "travel_trip_polls"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  "choice" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("pollId", "userId", "choice")
);
