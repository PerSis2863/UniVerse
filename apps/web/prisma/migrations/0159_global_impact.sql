-- Stage 5 · Q16 Global impact: donations to NGO projects, certificates at 10 / 50 / 100 verified
-- volunteering hours, and clubs' carbon tracker.

-- NGOs: whether they take donations here, and their Indian tax details for receipts (80G).
ALTER TABLE "ngos" ADD COLUMN "donationsOn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ngos" ADD COLUMN "reg80G" TEXT;
ALTER TABLE "ngos" ADD COLUMN "pan" TEXT;

-- A donation to an NGO project, paid online (payment_orders). Names are copied so the record and
-- its receipt stay complete if the project or the account is later removed.
CREATE TABLE "donations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT,
  "ngoId" TEXT,
  "projectName" TEXT NOT NULL,
  "ngoName" TEXT NOT NULL,
  "donorId" TEXT,
  "donorName" TEXT NOT NULL,
  "donorEmail" TEXT,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "orderId" TEXT,
  "receiptNo" INTEGER,
  "anonymous" BOOLEAN NOT NULL DEFAULT false,
  "message" TEXT,
  "pan" TEXT,
  "address" TEXT,
  "reg80G" TEXT,
  "ngoPan" TEXT,
  "paidAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "donations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ngo_projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "donations_ngoId_fkey" FOREIGN KEY ("ngoId") REFERENCES "ngos" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "donations_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "donations_orderId_key" ON "donations"("orderId");
CREATE UNIQUE INDEX "donations_receiptNo_key" ON "donations"("receiptNo");
CREATE INDEX "donations_projectId_idx" ON "donations"("projectId");
CREATE INDEX "donations_donorId_idx" ON "donations"("donorId");
CREATE INDEX "donations_status_idx" ON "donations"("status");

-- Certificates issued by themselves at 10, 50 and 100 verified hours: one each per person.
ALTER TABLE "impact_certificates" ADD COLUMN "milestoneHours" INTEGER;
CREATE UNIQUE INDEX "impact_certificates_userId_milestoneHours_key" ON "impact_certificates"("userId", "milestoneHours");

-- A club's carbon tracker: what it did and the kg CO2e worked out from a standard factor.
CREATE TABLE "club_carbon_entries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "associationId" TEXT NOT NULL,
  "userId" TEXT,
  "activity" TEXT NOT NULL,
  "quantity" REAL NOT NULL,
  "kgCo2e" REAL NOT NULL,
  "note" TEXT,
  "occurredAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "club_carbon_entries_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "associations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "club_carbon_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "club_carbon_entries_associationId_occurredAt_idx" ON "club_carbon_entries"("associationId", "occurredAt");
