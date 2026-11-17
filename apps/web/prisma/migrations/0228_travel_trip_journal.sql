-- M242: a trip's journal: notes and photos by the people planning it, each on a day of the trip, told as a story
-- with the route. An entry is "shared" when its author lets it into the trip's family link (M248). Goes with its trip.

CREATE TABLE IF NOT EXISTS "travel_trip_journal" (
  "id" TEXT PRIMARY KEY,
  "tripId" TEXT NOT NULL REFERENCES "travel_trips"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  "day" INTEGER NOT NULL DEFAULT 0,
  "text" TEXT,
  "photoUrl" TEXT,
  "place" TEXT,
  "shared" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "travel_trip_journal_tripId_idx" ON "travel_trip_journal" ("tripId");
