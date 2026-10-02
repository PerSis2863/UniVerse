-- AI budget: how many AI requests each person (and the whole site, userId "*") made each UTC day,
-- the owner's daily limits, and saved AI answers that are handed out again instead of asking AI.
ALTER TABLE "server_control" ADD COLUMN "aiLimits" TEXT;
CREATE TABLE "ai_usage" (
    "day" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("day", "userId")
);
CREATE TABLE "ai_cache" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
