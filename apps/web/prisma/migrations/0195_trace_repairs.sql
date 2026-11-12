-- M145: Trace, repair and resale history (the owner, 10 Nov 2026). Each repair to a unit, logged on its
-- passport by the brand's team (shown as checked by the brand) or by its owner at the time. Together with
-- trace_owners.owners (how many owners it has had) a second-hand buyer sees the unit's whole story.

CREATE TABLE IF NOT EXISTS "trace_repairs" (
  "id" TEXT PRIMARY KEY,
  "codeId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "userId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "by" TEXT NOT NULL DEFAULT 'OWNER',
  "what" TEXT NOT NULL,
  "parts" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_repairs_code_idx" ON "trace_repairs"("codeId", "createdAt");
CREATE INDEX IF NOT EXISTS "trace_repairs_brand_idx" ON "trace_repairs"("brandId", "createdAt");
