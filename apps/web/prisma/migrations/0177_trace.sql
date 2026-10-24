-- Migration 0177: UniVerse Trace (the owner, 24 Oct 2026: "make this project something unique and
-- different and bold"). Every product gets a passport: a brand's products, the batches it makes, one
-- unguessable code per unit (printed as a QR code), every scan of a code (who, where, and whether it
-- looks genuine), and the journey of each batch from where it was made to the shop.

CREATE TABLE IF NOT EXISTS "trace_products" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "category" TEXT,
  "description" TEXT,
  "story" TEXT,
  "imageUrl" TEXT,
  "rewardPoints" INTEGER NOT NULL DEFAULT 10,
  "warrantyMonths" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_products_org_idx" ON "trace_products"("organizationId");

CREATE TABLE IF NOT EXISTS "trace_batches" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL REFERENCES "trace_products"("id") ON DELETE CASCADE,
  "organizationId" TEXT REFERENCES "organizations"("id") ON DELETE CASCADE,
  "label" TEXT NOT NULL,
  -- Every printed code is codeKey + serial + a signature made with this batch's own secret (never
  -- sent to a browser), so codes can't be guessed or forged and none are stored until first scanned.
  "codeKey" TEXT NOT NULL UNIQUE,
  "secret" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "origin" TEXT,
  "lat" REAL,
  "lng" REAL,
  "madeAt" DATETIME,
  "createdById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_batches_product_idx" ON "trace_batches"("productId");
CREATE INDEX IF NOT EXISTS "trace_batches_org_idx" ON "trace_batches"("organizationId");

CREATE TABLE IF NOT EXISTS "trace_codes" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL REFERENCES "trace_batches"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "trace_products"("id") ON DELETE CASCADE,
  "organizationId" TEXT REFERENCES "organizations"("id") ON DELETE CASCADE,
  "serial" INTEGER NOT NULL,
  "scanCount" INTEGER NOT NULL DEFAULT 0,
  "firstScanAt" DATETIME,
  "firstLat" REAL,
  "firstLng" REAL,
  "firstPlace" TEXT,
  "firstCountry" TEXT,
  "claimedById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "claimedAt" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_codes_batch_idx" ON "trace_codes"("batchId", "serial");
CREATE INDEX IF NOT EXISTS "trace_codes_org_idx" ON "trace_codes"("organizationId");
CREATE INDEX IF NOT EXISTS "trace_codes_claimed_idx" ON "trace_codes"("claimedById");

CREATE TABLE IF NOT EXISTS "trace_scans" (
  "id" TEXT PRIMARY KEY,
  "codeId" TEXT NOT NULL REFERENCES "trace_codes"("id") ON DELETE CASCADE,
  "organizationId" TEXT REFERENCES "organizations"("id") ON DELETE CASCADE,
  "userId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "verdict" TEXT NOT NULL,
  "lat" REAL,
  "lng" REAL,
  "place" TEXT,
  "country" TEXT,
  "device" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_scans_code_idx" ON "trace_scans"("codeId", "createdAt");
CREATE INDEX IF NOT EXISTS "trace_scans_org_idx" ON "trace_scans"("organizationId", "createdAt");

CREATE TABLE IF NOT EXISTS "trace_events" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL REFERENCES "trace_batches"("id") ON DELETE CASCADE,
  "organizationId" TEXT REFERENCES "organizations"("id") ON DELETE CASCADE,
  "stage" TEXT NOT NULL,
  "place" TEXT,
  "lat" REAL,
  "lng" REAL,
  "note" TEXT,
  "actorId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_events_batch_idx" ON "trace_events"("batchId", "createdAt");
