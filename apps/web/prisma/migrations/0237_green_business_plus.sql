-- M276–M281: Green → Business, second wave. Plans paid through the owner's Stripe (off until the owner's switch);
-- each line's data quality and site; the scope 3 screening and an internal carbon price on the company; a register of
-- energy certificates, offsets and removals (never netted off the footprint); independent verification by an invited
-- verifier with questions on lines and a signed statement tied to the numbers it covered.

ALTER TABLE "green_orgs" ADD COLUMN "tier" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "green_orgs" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "green_orgs" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "green_orgs" ADD COLUMN "screening" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "green_orgs" ADD COLUMN "carbonPrice" REAL;

ALTER TABLE "green_entries" ADD COLUMN "quality" TEXT;
ALTER TABLE "green_entries" ADD COLUMN "site" TEXT;

CREATE TABLE IF NOT EXISTS "green_credits" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL REFERENCES "green_orgs"("id") ON DELETE CASCADE,
  "year" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "quantity" REAL NOT NULL,
  "registry" TEXT,
  "project" TEXT,
  "serial" TEXT,
  "vintage" INTEGER,
  "retired" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "green_credits_orgId_year_idx" ON "green_credits" ("orgId", "year");

CREATE TABLE IF NOT EXISTS "green_verifications" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL REFERENCES "green_orgs"("id") ON DELETE CASCADE,
  "year" INTEGER NOT NULL,
  "verifierId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "firm" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'reviewing',
  "standard" TEXT,
  "level" TEXT,
  "scopes" TEXT,
  "accreditation" TEXT,
  "opinion" TEXT,
  "snapshot" TEXT,
  "signature" TEXT,
  "signedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "green_verifications_orgId_year_idx" ON "green_verifications" ("orgId", "year");
CREATE INDEX IF NOT EXISTS "green_verifications_verifierId_idx" ON "green_verifications" ("verifierId");

CREATE TABLE IF NOT EXISTS "green_queries" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL REFERENCES "green_orgs"("id") ON DELETE CASCADE,
  "verificationId" TEXT NOT NULL REFERENCES "green_verifications"("id") ON DELETE CASCADE,
  "entryId" TEXT,
  "question" TEXT NOT NULL,
  "answer" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt" DATETIME
);
CREATE INDEX IF NOT EXISTS "green_queries_verificationId_idx" ON "green_queries" ("verificationId");
