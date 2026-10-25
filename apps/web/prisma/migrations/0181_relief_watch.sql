-- Relief alerts (24 Oct 2026, the owner: "notifications for Relief helpers"): a helper's opt-in to be
-- told about new needs near a place they choose (rounded like posts, about 500 m), within a radius,
-- urgent only by default. One row per person.
CREATE TABLE IF NOT EXISTS "relief_watches" (
  "userId" TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "lat" REAL NOT NULL,
  "lng" REAL NOT NULL,
  "radiusKm" REAL NOT NULL DEFAULT 5,
  "urgentOnly" BOOLEAN NOT NULL DEFAULT 1,
  "kinds" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "relief_watches_pos_idx" ON "relief_watches"("lat", "lng");
