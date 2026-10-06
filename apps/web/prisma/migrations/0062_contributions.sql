-- Stage 4 · 4.3: fair group work. Edits per person per document / code room per day (counted by the
-- live room, cloudflare/worker.ts CodeRoom), and peer ratings within a space.
CREATE TABLE "contributions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tool" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "edits" INTEGER NOT NULL DEFAULT 0,
  "bytes" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "contributions_userId_tool_refId_day_key" ON "contributions"("userId", "tool", "refId", "day");
CREATE INDEX "contributions_tool_refId_day_idx" ON "contributions"("tool", "refId", "day");
CREATE TABLE "peer_ratings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "spaceKind" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "raterId" TEXT NOT NULL,
  "rateeId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "peer_ratings_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "peer_ratings_rateeId_fkey" FOREIGN KEY ("rateeId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "peer_ratings_spaceKind_spaceId_raterId_rateeId_key" ON "peer_ratings"("spaceKind", "spaceId", "raterId", "rateeId");
CREATE INDEX "peer_ratings_spaceKind_spaceId_idx" ON "peer_ratings"("spaceKind", "spaceId");
