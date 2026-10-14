-- Stage 5 · D15, the classroom twin (live campus map): buildings drawn on a simple map of the campus,
-- rooms placed in a building and on a floor, and campus events placed in a building.
CREATE TABLE "campus_buildings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "campusId" TEXT,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "x" INTEGER NOT NULL DEFAULT 0,
  "y" INTEGER NOT NULL DEFAULT 0,
  "w" INTEGER NOT NULL DEFAULT 180,
  "h" INTEGER NOT NULL DEFAULT 120,
  "floors" INTEGER NOT NULL DEFAULT 1,
  "color" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "campus_buildings_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "campus_buildings_campusId_idx" ON "campus_buildings"("campusId");
ALTER TABLE "rooms" ADD COLUMN "buildingId" TEXT REFERENCES "campus_buildings" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rooms" ADD COLUMN "floor" INTEGER;
CREATE INDEX "rooms_buildingId_idx" ON "rooms"("buildingId");
ALTER TABLE "campus_items" ADD COLUMN "buildingId" TEXT REFERENCES "campus_buildings" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "campus_items_buildingId_idx" ON "campus_items"("buildingId");
