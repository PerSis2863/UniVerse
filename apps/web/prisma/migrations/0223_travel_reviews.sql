-- M209: reviews of real places written by UniVerse's own people (the owner, 16 Nov 2026: "real data of
-- places and reviews of people from that places"; reviews from paid services were left out). A place is
-- its OpenStreetMap id (N123, W123, R123) or a Wikipedia article (wp:<title>). One review a person a
-- place; "I live here" marks what locals say apart from visitors. Three reports hide a review.

CREATE TABLE IF NOT EXISTS "travel_reviews" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "place" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "lat" REAL,
  "lon" REAL,
  "rating" INTEGER NOT NULL,
  "text" TEXT,
  "local" INTEGER NOT NULL DEFAULT 0,
  "visited" TEXT,
  "hidden" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "travel_reviews_userId_place_key" ON "travel_reviews" ("userId", "place");
CREATE INDEX IF NOT EXISTS "travel_reviews_place_idx" ON "travel_reviews" ("place");
CREATE INDEX IF NOT EXISTS "travel_reviews_lat_lon_idx" ON "travel_reviews" ("lat", "lon");

CREATE TABLE IF NOT EXISTS "travel_review_reports" (
  "reviewId" TEXT NOT NULL REFERENCES "travel_reviews"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("reviewId", "userId")
);
CREATE INDEX IF NOT EXISTS "travel_review_reports_userId_idx" ON "travel_review_reports" ("userId");
