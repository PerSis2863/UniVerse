-- M269–M275: Green → Business. A company's carbon footprint (GHG Protocol scopes 1–3): the companies and who
-- works on them (a consultancy may manage client companies), the lines of the ledger, a hash-chained log of every
-- change (an auditor may read it through a link), suppliers asked for their own figures, and the staff commute
-- survey. Share links are unguessable codes (suppliers, staff, auditors): public pages answer them without
-- anyone's email or phone.

CREATE TABLE IF NOT EXISTS "green_orgs" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'company',
  "country" TEXT,
  "industry" TEXT,
  "employees" INTEGER,
  "revenue" REAL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "baseYear" INTEGER,
  "targetYear" INTEGER,
  "targetPct" REAL,
  "plan" TEXT NOT NULL DEFAULT '{}',
  "consultancyId" TEXT REFERENCES "green_orgs"("id") ON DELETE SET NULL,
  "auditCode" TEXT,
  "surveyCode" TEXT,
  "createdById" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "green_orgs_consultancyId_idx" ON "green_orgs" ("consultancyId");
CREATE UNIQUE INDEX IF NOT EXISTS "green_orgs_auditCode_key" ON "green_orgs" ("auditCode");
CREATE UNIQUE INDEX IF NOT EXISTS "green_orgs_surveyCode_key" ON "green_orgs" ("surveyCode");

CREATE TABLE IF NOT EXISTS "green_org_members" (
  "orgId" TEXT NOT NULL REFERENCES "green_orgs"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL DEFAULT 'editor',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("orgId", "userId")
);
CREATE INDEX IF NOT EXISTS "green_org_members_userId_idx" ON "green_org_members" ("userId");

CREATE TABLE IF NOT EXISTS "green_entries" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL REFERENCES "green_orgs"("id") ON DELETE CASCADE,
  "period" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "scope" INTEGER NOT NULL,
  "quantity" REAL NOT NULL,
  "factor" REAL NOT NULL,
  "factorSource" TEXT NOT NULL,
  "kg" REAL NOT NULL,
  "note" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "refId" TEXT,
  "createdById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "green_entries_orgId_period_idx" ON "green_entries" ("orgId", "period");
CREATE INDEX IF NOT EXISTS "green_entries_refId_idx" ON "green_entries" ("refId");

CREATE TABLE IF NOT EXISTS "green_audit" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL REFERENCES "green_orgs"("id") ON DELETE CASCADE,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "prevHash" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "green_audit_orgId_createdAt_idx" ON "green_audit" ("orgId", "createdAt");

CREATE TABLE IF NOT EXISTS "green_suppliers" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL REFERENCES "green_orgs"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "contact" TEXT,
  "spend" REAL,
  "year" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'asked',
  "answer" TEXT,
  "kg" REAL,
  "answeredAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "green_suppliers_orgId_idx" ON "green_suppliers" ("orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "green_suppliers_code_key" ON "green_suppliers" ("code");

CREATE TABLE IF NOT EXISTS "green_commutes" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL REFERENCES "green_orgs"("id") ON DELETE CASCADE,
  "userId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "mode" TEXT NOT NULL,
  "kmOneWay" REAL NOT NULL,
  "daysWeek" REAL NOT NULL,
  "kgYear" REAL NOT NULL,
  "year" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "green_commutes_orgId_year_idx" ON "green_commutes" ("orgId", "year");
CREATE UNIQUE INDEX IF NOT EXISTS "green_commutes_org_user_year_key" ON "green_commutes" ("orgId", "userId", "year");
