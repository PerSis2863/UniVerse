-- M183: UniVerse Travel (the owner, 15 Nov 2026: "one more app … about the travelling … where to eat, to
-- sleep, to visit, few facts, ideas and much more and also can book through our website").
-- travel_cache keeps what the app reads from public sources (Wikivoyage guides, country facts, the
-- weather, search answers) so each is fetched rarely: a key, the answer as JSON, when it was fetched.
-- travel_saved is a person's saved places (from a guide's listings, or their own).

CREATE TABLE IF NOT EXISTS "travel_cache" (
  "key" TEXT PRIMARY KEY,
  "data" TEXT NOT NULL,
  "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "travel_saved" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "guide" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'see',
  "lat" REAL,
  "lon" REAL,
  "note" TEXT,
  "address" TEXT,
  "url" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "travel_saved_user_guide_name" ON "travel_saved" ("userId", "guide", "name");
