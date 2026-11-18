-- M317: home energy from bills (Green → Footprint). A person's household (how many live there, the country whose grid
-- their electricity comes from) and each month's bills by kind, with the kg CO₂e worked out from src/lib/green.ts.
CREATE TABLE IF NOT EXISTS "green_homes" (
  "userId" TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "people" INTEGER NOT NULL DEFAULT 1,
  "country" TEXT,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "green_bills" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "month" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "unit" TEXT NOT NULL,
  "greenTariff" BOOLEAN NOT NULL DEFAULT false,
  "kg" REAL NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "green_bills_userId_month_kind_key" ON "green_bills" ("userId", "month", "kind");
