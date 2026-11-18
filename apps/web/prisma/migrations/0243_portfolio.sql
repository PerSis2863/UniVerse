-- M296: portfolios. The pieces of work a student shows on their passport (a graded hand-in, a project or a link,
-- each with their own words about it), and private share links that expire, for applications: a link shows the
-- passport and its work even while the passport isn't public, until it expires or is taken back.
CREATE TABLE IF NOT EXISTS "portfolio_items" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL DEFAULT 'PROJECT',
  "title" TEXT NOT NULL,
  "body" TEXT,
  "url" TEXT,
  "submissionId" TEXT,
  "course" TEXT,
  "grade" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "portfolio_items_userId_idx" ON "portfolio_items" ("userId", "position");

CREATE TABLE IF NOT EXISTS "portfolio_shares" (
  "token" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "label" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "views" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "portfolio_shares_userId_idx" ON "portfolio_shares" ("userId");
