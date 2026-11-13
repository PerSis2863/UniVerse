-- M166: a person's page arrangements (drag to reorder, resize; src/lib/arrange.ts), kept in the account
-- only when they turn on "Use my arrangement on my other devices" in Settings. One row per person: the
-- whole document as JSON (each page's groups and when each page was last changed). No row = sync is off.

CREATE TABLE IF NOT EXISTS "user_arrangements" (
  "userId" TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "data" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
