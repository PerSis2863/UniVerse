-- Collaborate → Create, saved work (M75): a tool's work kept on the account, so it follows the person
-- to every device, and can be shared read-only by an unguessable link (shareToken, null = private).
-- `data` is the tool's own kept state ({ "uv-…": "…" }), at most 200 KB; at most 300 saves a person.
CREATE TABLE IF NOT EXISTS "tool_saves" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tool" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "shareToken" TEXT UNIQUE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "tool_saves_user_idx" ON "tool_saves"("userId", "updatedAt");
