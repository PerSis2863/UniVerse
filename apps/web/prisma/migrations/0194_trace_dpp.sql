-- M108: the EU Digital Product Passport for UniVerse Trace (the owner's seven ideas: "the EU Digital
-- Product Passport for Trace (GS1 codes, supplier portal)"). A product's GTIN (14 digits, check digit
-- checked; one product per GTIN) for GS1 Digital Link addresses, its passport (JSON, cleaned by
-- src/lib/dpp.ts parseDpp) and the requests a brand sends its suppliers to fill in one material each,
-- by a link (only a hash of its secret is kept).

ALTER TABLE "trace_products" ADD COLUMN "gtin" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "trace_products_gtin_key" ON "trace_products"("gtin");
ALTER TABLE "trace_products" ADD COLUMN "dpp" TEXT;
ALTER TABLE "trace_products" ADD COLUMN "dppUpdatedAt" DATETIME;

CREATE TABLE IF NOT EXISTS "trace_supply_requests" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL REFERENCES "trace_brands"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "trace_products"("id") ON DELETE CASCADE,
  "supplier" TEXT NOT NULL,
  "asks" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "answer" TEXT,
  "answeredAt" DATETIME,
  "usedAt" DATETIME,
  "createdById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS "trace_supply_requests_product_idx" ON "trace_supply_requests"("productId", "createdAt");
