-- M173: Trace across the supply chain (the owner, 13 Nov 2026). A product's price (seen by the brand,
-- shops and buyers, never by drivers or warehouses); who recorded each stop of a batch, and for which
-- unit; the brand's supply-chain team (warehouses, drivers, shops) and the links that invite them.

ALTER TABLE "trace_products" ADD COLUMN "price" REAL;
ALTER TABLE "trace_products" ADD COLUMN "currency" TEXT;
ALTER TABLE "trace_events" ADD COLUMN "role" TEXT;
ALTER TABLE "trace_events" ADD COLUMN "codeId" TEXT;
CREATE INDEX IF NOT EXISTS "trace_events_codeId_idx" ON "trace_events"("codeId");

CREATE TABLE IF NOT EXISTS "trace_handlers" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL REFERENCES "trace_brands"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "trace_handlers_brandId_userId_key" ON "trace_handlers"("brandId", "userId");
CREATE INDEX IF NOT EXISTS "trace_handlers_userId_idx" ON "trace_handlers"("userId");

CREATE TABLE IF NOT EXISTS "trace_handler_invites" (
  "code" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL REFERENCES "trace_brands"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL,
  "createdById" TEXT,
  "uses" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_handler_invites_brandId_idx" ON "trace_handler_invites"("brandId");
