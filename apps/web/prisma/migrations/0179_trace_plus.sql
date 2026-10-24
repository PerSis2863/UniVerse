-- Migration 0179: twelve more UniVerse Trace features (the owner, 24 Oct 2026: "add more and unique
-- one… atleast 10 more unique feature").
-- Recalls (a red notice on every passport of a batch), warranties registered from the passport,
-- ownership (a buyer's Vault, transferred with a one-time code for resale), buyer reviews, instant
-- wins on a first genuine scan, authorised markets per batch (scans elsewhere are "diverted": grey
-- market), blocking a whole batch of leaked codes, cold-chain temperatures from the driver's phone,
-- and a product's weight (for the CO2 of its journey).

CREATE TABLE IF NOT EXISTS "trace_recalls" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL REFERENCES "trace_brands"("id") ON DELETE CASCADE,
  "batchId" TEXT NOT NULL REFERENCES "trace_batches"("id") ON DELETE CASCADE,
  "reason" TEXT NOT NULL,
  "advice" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'HIGH',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" DATETIME
);
CREATE INDEX IF NOT EXISTS "trace_recalls_batch_idx" ON "trace_recalls"("batchId", "status");
CREATE INDEX IF NOT EXISTS "trace_recalls_brand_idx" ON "trace_recalls"("brandId", "createdAt");

CREATE TABLE IF NOT EXISTS "trace_warranties" (
  "id" TEXT PRIMARY KEY,
  "codeId" TEXT NOT NULL UNIQUE,
  "brandId" TEXT NOT NULL REFERENCES "trace_brands"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "trace_products"("id") ON DELETE CASCADE,
  "userId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "name" TEXT,
  "email" TEXT,
  "country" TEXT,
  "endsAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_warranties_brand_idx" ON "trace_warranties"("brandId", "createdAt");

CREATE TABLE IF NOT EXISTS "trace_owners" (
  "id" TEXT PRIMARY KEY,
  "codeId" TEXT NOT NULL UNIQUE,
  "brandId" TEXT NOT NULL REFERENCES "trace_brands"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "trace_products"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "owners" INTEGER NOT NULL DEFAULT 1,
  "transferCode" TEXT UNIQUE,
  "transferUntil" DATETIME,
  "since" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_owners_user_idx" ON "trace_owners"("userId");

CREATE TABLE IF NOT EXISTS "trace_reviews" (
  "id" TEXT PRIMARY KEY,
  "codeId" TEXT NOT NULL UNIQUE,
  "brandId" TEXT NOT NULL REFERENCES "trace_brands"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "trace_products"("id") ON DELETE CASCADE,
  "userId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "stars" INTEGER NOT NULL,
  "text" TEXT,
  "place" TEXT,
  "country" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_reviews_brand_idx" ON "trace_reviews"("brandId", "createdAt");

CREATE TABLE IF NOT EXISTS "trace_wins" (
  "id" TEXT PRIMARY KEY,
  "codeId" TEXT NOT NULL UNIQUE,
  "brandId" TEXT NOT NULL REFERENCES "trace_brands"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "trace_products"("id") ON DELETE CASCADE,
  "prize" TEXT NOT NULL,
  "claimCode" TEXT NOT NULL UNIQUE,
  "place" TEXT,
  "redeemedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_wins_brand_idx" ON "trace_wins"("brandId", "createdAt");

ALTER TABLE "trace_products" ADD COLUMN "winOdds" INTEGER;
ALTER TABLE "trace_products" ADD COLUMN "winPrize" TEXT;
ALTER TABLE "trace_products" ADD COLUMN "maxTempC" REAL;
ALTER TABLE "trace_products" ADD COLUMN "weightKg" REAL NOT NULL DEFAULT 1;
ALTER TABLE "trace_batches" ADD COLUMN "allowedCountries" TEXT;
ALTER TABLE "trace_batches" ADD COLUMN "blockedAt" DATETIME;
ALTER TABLE "trace_scans" ADD COLUMN "diverted" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "trace_pings" ADD COLUMN "tempC" REAL;
