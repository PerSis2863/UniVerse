-- M254: a trip's before-you-go checklist, shared by everyone planning it: a thing to do, who's doing it (a member, or
-- nobody yet), by when, and whether it's done (and by whom). Goes with its trip.
CREATE TABLE IF NOT EXISTS "travel_trip_todos" (
  "id" TEXT PRIMARY KEY,
  "tripId" TEXT NOT NULL REFERENCES "travel_trips"("id") ON DELETE CASCADE,
  "text" TEXT NOT NULL,
  "assignee" TEXT,
  "due" TEXT,
  "done" BOOLEAN NOT NULL DEFAULT false,
  "doneBy" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "travel_trip_todos_tripId_idx" ON "travel_trip_todos" ("tripId");
