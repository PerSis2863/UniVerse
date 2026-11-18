-- M248: a trip's family link (a read-only page of the plan, by an unguessable code; null when it's off) and the
-- travellers' "I'm safe" check-ins, which show there and reach the others on the trip. Check-ins go with their trip.
ALTER TABLE "travel_trips" ADD COLUMN "shareCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "travel_trips_shareCode_key" ON "travel_trips" ("shareCode");

CREATE TABLE IF NOT EXISTS "travel_trip_checkins" (
  "id" TEXT PRIMARY KEY,
  "tripId" TEXT NOT NULL REFERENCES "travel_trips"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  "note" TEXT,
  "place" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "travel_trip_checkins_tripId_idx" ON "travel_trip_checkins" ("tripId");
