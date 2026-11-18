-- M320: a swap and repair board (Green → Swap & repair): neighbours give, swap, lend or ask for things, and offer or
-- ask for repairs, in their 0.1° neighbourhood (M318). Contact is a UniVerse message only; three reports hide a post;
-- posts close after 30 days.
CREATE TABLE IF NOT EXISTS "green_swaps" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'other',
  "title" TEXT NOT NULL,
  "details" TEXT,
  "areaLat" REAL NOT NULL,
  "areaLng" REAL NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "reports" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "doneAt" DATETIME
);
CREATE INDEX IF NOT EXISTS "green_swaps_area_idx" ON "green_swaps" ("areaLat", "areaLng", "status");
CREATE INDEX IF NOT EXISTS "green_swaps_userId_idx" ON "green_swaps" ("userId");
CREATE TABLE IF NOT EXISTS "green_swap_reports" (
  "swapId" TEXT NOT NULL REFERENCES "green_swaps"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("swapId", "userId")
);
