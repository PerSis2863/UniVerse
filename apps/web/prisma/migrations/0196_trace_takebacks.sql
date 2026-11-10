-- M146: Trace, take-back and recycling (the owner, 10 Nov 2026). A brand offers it per product (how to
-- hand it in, and points for its owner); the owner of a unit asks to return it and gets a drop-off code;
-- the brand marks it received, which pays the points and records a confirmed "recycled" action in Green.
-- One take-back per unit.

ALTER TABLE "trace_products" ADD COLUMN "takeBackHow" TEXT;
ALTER TABLE "trace_products" ADD COLUMN "takeBackPoints" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "trace_takebacks" (
  "id" TEXT PRIMARY KEY,
  "codeId" TEXT NOT NULL UNIQUE,
  "brandId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'ASKED',
  "dropCode" TEXT NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0,
  "receivedById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "receivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_takebacks_brand_idx" ON "trace_takebacks"("brandId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "trace_takebacks_user_idx" ON "trace_takebacks"("userId");
