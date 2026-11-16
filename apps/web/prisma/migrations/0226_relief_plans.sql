-- M217: a person's emergency plan (meeting points, contacts, needs: theirs only, never shown to anyone else)
-- and their go-bag ticks.

CREATE TABLE IF NOT EXISTS "relief_plans" (
  "userId" TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "plan" TEXT NOT NULL DEFAULT '{}',
  "kit" TEXT NOT NULL DEFAULT '[]',
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
