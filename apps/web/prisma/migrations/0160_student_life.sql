-- Stage 5 · Q17 Student life: paid and signed event tickets, club elections and budgets, the campus
-- board (marketplace, rides, housing), and cafeteria pre-orders.

-- Events with a ticket price (minor units); a seat is held while the buyer pays.
ALTER TABLE "campus_items" ADD COLUMN "price" INTEGER;
ALTER TABLE "campus_items" ADD COLUMN "currency" TEXT;
ALTER TABLE "event_rsvps" ADD COLUMN "orderId" TEXT;
ALTER TABLE "event_rsvps" ADD COLUMN "heldUntil" DATETIME;
CREATE UNIQUE INDEX "event_rsvps_orderId_key" ON "event_rsvps"("orderId");

-- Club elections. Who voted and what was voted are kept in two tables with no link between them, and
-- neither keeps the order rows arrived in (WITHOUT ROWID, keyed by values that say nothing about
-- time), so a ballot can't be traced back to its voter. Each voter keeps a receipt to find their
-- ballot in the published list once the election closes.
CREATE TABLE "club_elections" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "associationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "candidates" TEXT NOT NULL DEFAULT '[]',
  "opensAt" DATETIME NOT NULL,
  "closesAt" DATETIME NOT NULL,
  "createdById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "club_elections_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "associations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "club_elections_associationId_idx" ON "club_elections"("associationId");
CREATE TABLE "club_voters" (
  "electionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  PRIMARY KEY ("electionId", "userId"),
  CONSTRAINT "club_voters_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "club_elections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
) WITHOUT ROWID;
CREATE TABLE "club_ballots" (
  "receipt" TEXT NOT NULL PRIMARY KEY,
  "electionId" TEXT NOT NULL,
  "choice" TEXT NOT NULL,
  CONSTRAINT "club_ballots_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "club_elections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
) WITHOUT ROWID;
CREATE INDEX "club_ballots_electionId_idx" ON "club_ballots"("electionId");

-- A club's money: what came in and went out, against its budget.
CREATE TABLE "club_budget_entries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "associationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "occurredAt" DATETIME NOT NULL,
  "receiptUrl" TEXT,
  "createdById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "club_budget_entries_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "associations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "club_budget_entries_associationId_occurredAt_idx" ON "club_budget_entries"("associationId", "occurredAt");

-- The campus board: things to sell, swap, give away or find; rides; rooms. Students only.
CREATE TABLE "campus_listings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "price" INTEGER,
  "photoUrl" TEXT,
  "fromPlace" TEXT,
  "toPlace" TEXT,
  "departAt" DATETIME,
  "seats" INTEGER,
  "area" TEXT,
  "availableFrom" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "reports" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_listings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "campus_listings_kind_status_idx" ON "campus_listings"("kind", "status");
CREATE INDEX "campus_listings_userId_idx" ON "campus_listings"("userId");
CREATE TABLE "listing_reports" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "listingId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listing_reports_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "campus_listings" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "listing_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "listing_reports_listingId_userId_key" ON "listing_reports"("listingId", "userId");

-- Cafeteria pre-orders from a day's menu, collected with a short code (paid at the counter).
CREATE TABLE "meal_orders" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "menuId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "items" TEXT NOT NULL DEFAULT '[]',
  "pickupAt" DATETIME NOT NULL,
  "note" TEXT,
  "code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLACED',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meal_orders_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "campus_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "meal_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "meal_orders_menuId_pickupAt_idx" ON "meal_orders"("menuId", "pickupAt");
CREATE INDEX "meal_orders_userId_idx" ON "meal_orders"("userId");
