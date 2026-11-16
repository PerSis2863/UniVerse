-- M206: UniVerse Travel's trip planner (the owner's Airbnb list, items 4, 5 and 7). A trip has its
-- cities in order (stops, each a number of days), the places planned into those days (items: a day
-- number inside the stop, or none while not planned yet) and the friends planning it with the owner
-- (members, joined with the trip's invite code). Every row goes with its trip.

CREATE TABLE IF NOT EXISTS "travel_trips" (
  "id" TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "startDate" TEXT,
  "travellers" INTEGER NOT NULL DEFAULT 1,
  "style" TEXT NOT NULL DEFAULT 'mid',
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "code" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "travel_trips_code_key" ON "travel_trips" ("code");
CREATE INDEX IF NOT EXISTS "travel_trips_ownerId_idx" ON "travel_trips" ("ownerId");

CREATE TABLE IF NOT EXISTS "travel_trip_members" (
  "tripId" TEXT NOT NULL REFERENCES "travel_trips"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("tripId", "userId")
);
CREATE INDEX IF NOT EXISTS "travel_trip_members_userId_idx" ON "travel_trip_members" ("userId");

CREATE TABLE IF NOT EXISTS "travel_trip_stops" (
  "id" TEXT PRIMARY KEY,
  "tripId" TEXT NOT NULL REFERENCES "travel_trips"("id") ON DELETE CASCADE,
  "guide" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cc" TEXT,
  "lat" REAL,
  "lon" REAL,
  "days" INTEGER NOT NULL DEFAULT 2,
  "position" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "travel_trip_stops_tripId_idx" ON "travel_trip_stops" ("tripId");

CREATE TABLE IF NOT EXISTS "travel_trip_items" (
  "id" TEXT PRIMARY KEY,
  "tripId" TEXT NOT NULL REFERENCES "travel_trips"("id") ON DELETE CASCADE,
  "stopId" TEXT NOT NULL REFERENCES "travel_trip_stops"("id") ON DELETE CASCADE,
  "day" INTEGER,
  "position" INTEGER NOT NULL DEFAULT 0,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'see',
  "lat" REAL,
  "lon" REAL,
  "hours" TEXT,
  "price" TEXT,
  "minutes" INTEGER NOT NULL DEFAULT 60,
  "note" TEXT,
  "address" TEXT,
  "url" TEXT,
  "addedById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "travel_trip_items_tripId_idx" ON "travel_trip_items" ("tripId");
CREATE INDEX IF NOT EXISTS "travel_trip_items_stopId_idx" ON "travel_trip_items" ("stopId");
