-- Migration 0178: the UniVerse Trace network (the owner, 24 Oct 2026: "do all 4 of them").
-- 1. Free brands anyone can start (no school needed): trace_brands + members; every Trace record now
--    belongs to a brand. 2. One wallet across brands: trace_points (hash-chained per person) and
--    cash-out requests. 3. Pay per verified scan: campaigns with an area, a bonus and a budget.
-- 4. The live maps: each scan also keeps Cloudflare's approximate city position (geoLat / geoLng), and
--    batches on the move send live positions (trace_pings) from a driver's phone (carrierKey link).

CREATE TABLE IF NOT EXISTS "trace_brands" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "category" TEXT,
  "color" TEXT,
  "logoUrl" TEXT,
  "plan" TEXT NOT NULL DEFAULT 'FREE',
  "pointValue" REAL NOT NULL DEFAULT 0.01,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "minCashout" INTEGER NOT NULL DEFAULT 500,
  "createdById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "trace_brand_members" (
  "brandId" TEXT NOT NULL REFERENCES "trace_brands"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL DEFAULT 'OWNER',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("brandId", "userId")
);
CREATE INDEX IF NOT EXISTS "trace_brand_members_user_idx" ON "trace_brand_members"("userId");

ALTER TABLE "trace_products" ADD COLUMN "brandId" TEXT REFERENCES "trace_brands"("id") ON DELETE CASCADE;
ALTER TABLE "trace_products" ADD COLUMN "sample" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "trace_batches" ADD COLUMN "brandId" TEXT REFERENCES "trace_brands"("id") ON DELETE CASCADE;
ALTER TABLE "trace_batches" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'MADE';
ALTER TABLE "trace_batches" ADD COLUMN "destPlace" TEXT;
ALTER TABLE "trace_batches" ADD COLUMN "destLat" REAL;
ALTER TABLE "trace_batches" ADD COLUMN "destLng" REAL;
ALTER TABLE "trace_batches" ADD COLUMN "carrierKey" TEXT;
ALTER TABLE "trace_codes" ADD COLUMN "brandId" TEXT REFERENCES "trace_brands"("id") ON DELETE CASCADE;
ALTER TABLE "trace_scans" ADD COLUMN "brandId" TEXT REFERENCES "trace_brands"("id") ON DELETE CASCADE;
ALTER TABLE "trace_scans" ADD COLUMN "productId" TEXT REFERENCES "trace_products"("id") ON DELETE CASCADE;
ALTER TABLE "trace_scans" ADD COLUMN "category" TEXT;
ALTER TABLE "trace_scans" ADD COLUMN "geoLat" REAL;
ALTER TABLE "trace_scans" ADD COLUMN "geoLng" REAL;
ALTER TABLE "trace_events" ADD COLUMN "brandId" TEXT REFERENCES "trace_brands"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "trace_products_brand_idx" ON "trace_products"("brandId");
CREATE INDEX IF NOT EXISTS "trace_batches_brand_idx" ON "trace_batches"("brandId");
CREATE INDEX IF NOT EXISTS "trace_codes_brand_idx" ON "trace_codes"("brandId");
CREATE INDEX IF NOT EXISTS "trace_scans_brand_idx" ON "trace_scans"("brandId", "createdAt");
CREATE INDEX IF NOT EXISTS "trace_scans_category_idx" ON "trace_scans"("category", "createdAt");

CREATE TABLE IF NOT EXISTS "trace_points" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "brandId" TEXT NOT NULL REFERENCES "trace_brands"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "codeId" TEXT,
  "campaignId" TEXT,
  "cashoutId" TEXT,
  "note" TEXT,
  "previousHash" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_points_user_idx" ON "trace_points"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "trace_points_brand_idx" ON "trace_points"("brandId", "createdAt");

CREATE TABLE IF NOT EXISTS "trace_cashouts" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "brandId" TEXT NOT NULL REFERENCES "trace_brands"("id") ON DELETE CASCADE,
  "points" INTEGER NOT NULL,
  "amount" REAL NOT NULL,
  "currency" TEXT NOT NULL,
  "payTo" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "decidedById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "decidedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_cashouts_brand_idx" ON "trace_cashouts"("brandId", "status");
CREATE INDEX IF NOT EXISTS "trace_cashouts_user_idx" ON "trace_cashouts"("userId");

CREATE TABLE IF NOT EXISTS "trace_campaigns" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL REFERENCES "trace_brands"("id") ON DELETE CASCADE,
  "productId" TEXT REFERENCES "trace_products"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "bonusPoints" INTEGER NOT NULL,
  "budgetPoints" INTEGER NOT NULL,
  "spentPoints" INTEGER NOT NULL DEFAULT 0,
  "scans" INTEGER NOT NULL DEFAULT 0,
  "feeCents" INTEGER NOT NULL DEFAULT 5,
  "country" TEXT,
  "lat" REAL,
  "lng" REAL,
  "radiusKm" REAL,
  "place" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startsAt" DATETIME,
  "endsAt" DATETIME,
  "createdById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_campaigns_brand_idx" ON "trace_campaigns"("brandId", "status");

CREATE TABLE IF NOT EXISTS "trace_pings" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL REFERENCES "trace_batches"("id") ON DELETE CASCADE,
  "brandId" TEXT REFERENCES "trace_brands"("id") ON DELETE CASCADE,
  "lat" REAL NOT NULL,
  "lng" REAL NOT NULL,
  "speedKmh" REAL,
  "heading" REAL,
  "accuracyM" REAL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_pings_batch_idx" ON "trace_pings"("batchId", "createdAt");
CREATE INDEX IF NOT EXISTS "trace_pings_brand_idx" ON "trace_pings"("brandId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "trace_batches_carrier_idx" ON "trace_batches"("carrierKey");
