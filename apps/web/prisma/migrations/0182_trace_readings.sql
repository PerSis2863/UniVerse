-- Cold chain with real sensors (24 Oct 2026, the owner: "real temperature sensors"): readings from a
-- Bluetooth thermometer paired on the driver's page, or posted by a connected logger or gateway to the
-- shipment's private link (or typed in by the driver). The brand hears about a warm shipment at most
-- once an hour (coldAlertAt).
CREATE TABLE IF NOT EXISTS "trace_readings" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL REFERENCES "trace_batches"("id") ON DELETE CASCADE,
  "brandId" TEXT REFERENCES "trace_brands"("id") ON DELETE CASCADE,
  "tempC" REAL NOT NULL,
  "humidity" REAL,
  "source" TEXT NOT NULL DEFAULT 'DEVICE',
  "device" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "trace_readings_batch_idx" ON "trace_readings"("batchId", "createdAt");
CREATE INDEX IF NOT EXISTS "trace_readings_brand_idx" ON "trace_readings"("brandId", "createdAt");
ALTER TABLE "trace_batches" ADD COLUMN "coldAlertAt" DATETIME;
