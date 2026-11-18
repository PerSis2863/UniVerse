-- M318: neighbourhood challenges. A person's neighbourhood is a 0.1° square (about 11 km, as Green's map), kept with
-- their household; challenges people there set for the area (a kind of action, a goal, a few weeks) count everyone's
-- confirmed actions in it. Counts only, and only once three people share the area.
ALTER TABLE "green_homes" ADD COLUMN "areaLat" REAL;
ALTER TABLE "green_homes" ADD COLUMN "areaLng" REAL;
CREATE INDEX IF NOT EXISTS "green_homes_area_idx" ON "green_homes" ("areaLat", "areaLng");
CREATE TABLE IF NOT EXISTS "green_area_challenges" (
  "id" TEXT PRIMARY KEY,
  "areaLat" REAL NOT NULL,
  "areaLng" REAL NOT NULL,
  "title" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "goal" REAL NOT NULL,
  "startsAt" DATETIME NOT NULL,
  "endsAt" DATETIME NOT NULL,
  "createdBy" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "green_area_challenges_area_idx" ON "green_area_challenges" ("areaLat", "areaLng", "endsAt");
