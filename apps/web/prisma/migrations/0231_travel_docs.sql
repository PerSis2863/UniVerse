-- M245: a traveller's documents (passport, visa, insurance, bookings…), by name and date only (never a number), for
-- a trip or none, and the reminders already sent for each (`reminded`, comma-separated keys). Only their owner ever
-- sees them. Leaving or deleting the trip keeps the document, without its trip.

CREATE TABLE IF NOT EXISTS "travel_docs" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tripId" TEXT REFERENCES "travel_trips"("id") ON DELETE SET NULL,
  "kind" TEXT NOT NULL DEFAULT 'other',
  "label" TEXT NOT NULL DEFAULT '',
  "expires" TEXT,
  "note" TEXT,
  "reminded" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "travel_docs_userId_idx" ON "travel_docs" ("userId");
CREATE INDEX IF NOT EXISTS "travel_docs_tripId_idx" ON "travel_docs" ("tripId");
