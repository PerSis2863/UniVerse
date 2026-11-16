-- M207: UniVerse Travel's travellers board (the owner's Airbnb list, item 6). Adults who choose to can
-- say they'll be in a city on some dates (first name, dates, a short note), and see the others who did
-- for the same city and overlapping dates; they message each other in the Travel app. A post is hidden
-- after three people report it; blocking hides two people from each other on the board and stops new
-- chats between them from it.

CREATE TABLE IF NOT EXISTS "travel_board" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "guide" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fromDate" TEXT NOT NULL,
  "toDate" TEXT NOT NULL,
  "note" TEXT,
  "hidden" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "travel_board_userId_guide_key" ON "travel_board" ("userId", "guide");
CREATE INDEX IF NOT EXISTS "travel_board_guide_idx" ON "travel_board" ("guide", "toDate");

CREATE TABLE IF NOT EXISTS "travel_board_reports" (
  "postId" TEXT NOT NULL REFERENCES "travel_board"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("postId", "userId")
);
CREATE INDEX IF NOT EXISTS "travel_board_reports_userId_idx" ON "travel_board_reports" ("userId");

CREATE TABLE IF NOT EXISTS "travel_blocks" (
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "blockedId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "blockedId")
);
CREATE INDEX IF NOT EXISTS "travel_blocks_blockedId_idx" ON "travel_blocks" ("blockedId");
