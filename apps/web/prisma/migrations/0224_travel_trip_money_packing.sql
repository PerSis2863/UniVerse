-- M215: a trip's shared costs (who paid what for whom; a payment back is one too) and its packing list,
-- shared by everyone planning the trip. Every row goes with its trip.

CREATE TABLE IF NOT EXISTS "travel_trip_expenses" (
  "id" TEXT PRIMARY KEY,
  "tripId" TEXT NOT NULL REFERENCES "travel_trips"("id") ON DELETE CASCADE,
  "paidBy" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'other',
  "what" TEXT NOT NULL,
  "day" TEXT,
  "split" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "travel_trip_expenses_tripId_idx" ON "travel_trip_expenses" ("tripId");

CREATE TABLE IF NOT EXISTS "travel_trip_packing" (
  "id" TEXT PRIMARY KEY,
  "tripId" TEXT NOT NULL REFERENCES "travel_trips"("id") ON DELETE CASCADE,
  "item" TEXT NOT NULL,
  "grp" TEXT NOT NULL DEFAULT 'Other',
  "done" BOOLEAN NOT NULL DEFAULT false,
  "doneBy" TEXT,
  "addedBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "travel_trip_packing_tripId_idx" ON "travel_trip_packing" ("tripId");
