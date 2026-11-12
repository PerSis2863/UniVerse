-- M147: Trace, reports of fake labels (the owner, 10 Nov 2026). When a check says a label is likely a
-- copy, the buyer can say where they bought it: a shop or website, a rough area, the price. The brand
-- sees them grouped by shop on its Radar, never who reported. One report per person per unit; positions
-- rounded to 0.1° (about 11 km), like the rest of Trace.

CREATE TABLE IF NOT EXISTS "trace_fake_reports" (
  "id" TEXT PRIMARY KEY,
  "codeId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "shop" TEXT NOT NULL,
  "area" TEXT,
  "price" TEXT,
  "lat" REAL,
  "lng" REAL,
  "country" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "trace_fake_reports_once" ON "trace_fake_reports"("codeId", "userId");
CREATE INDEX IF NOT EXISTS "trace_fake_reports_brand_idx" ON "trace_fake_reports"("brandId", "createdAt");
