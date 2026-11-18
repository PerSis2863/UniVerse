-- M309: warranty claims from start to finish. An owner with a warranty still running claims from their vault (what's
-- wrong, maybe a photo); the brand moves it on (in review, approved, repaired / replaced / refunded, or refused with a
-- reason, then closed); each step is kept in its timeline and told to the other side in the app.
CREATE TABLE IF NOT EXISTS "trace_claims" (
  "id" TEXT PRIMARY KEY,
  "codeId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL REFERENCES "trace_brands"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "issue" TEXT NOT NULL,
  "photoUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "timeline" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_claims_brandId_status_idx" ON "trace_claims" ("brandId", "status");
CREATE INDEX IF NOT EXISTS "trace_claims_userId_idx" ON "trace_claims" ("userId");
CREATE INDEX IF NOT EXISTS "trace_claims_codeId_idx" ON "trace_claims" ("codeId");
