-- Migration 0117: Impact-to-Scholarship Exchange (Stage 5 · D4)
-- Cryptographic hash-chained Impact Credit ledger, sponsor scholarship pools,
-- student claim workflow with academic standing prerequisites, and public QR verification.

CREATE TABLE IF NOT EXISTS "impact_credits" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "organizationId" TEXT REFERENCES "organizations"("id") ON DELETE SET NULL,
  "actionType" TEXT NOT NULL,
  "credits" REAL NOT NULL,
  "balanceAfter" REAL NOT NULL,
  "sourceReferenceId" TEXT,
  "description" TEXT NOT NULL,
  "previousHash" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "impact_credits_user_idx" ON "impact_credits"("userId");
CREATE INDEX IF NOT EXISTS "impact_credits_org_idx" ON "impact_credits"("organizationId");
CREATE INDEX IF NOT EXISTS "impact_credits_created_idx" ON "impact_credits"("createdAt");

CREATE TABLE IF NOT EXISTS "impact_sponsor_pools" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "sponsorName" TEXT NOT NULL,
  "sponsorType" TEXT NOT NULL DEFAULT 'CORPORATE',
  "description" TEXT,
  "totalAmount" REAL NOT NULL,
  "allocatedAmount" REAL NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "creditCostPerAward" REAL NOT NULL DEFAULT 50,
  "awardAmountPerStudent" REAL NOT NULL DEFAULT 1000,
  "minGpa" REAL NOT NULL DEFAULT 3.0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "impact_sponsor_pools_org_idx" ON "impact_sponsor_pools"("organizationId");
CREATE INDEX IF NOT EXISTS "impact_sponsor_pools_status_idx" ON "impact_sponsor_pools"("status");

CREATE TABLE IF NOT EXISTS "impact_scholarship_claims" (
  "id" TEXT PRIMARY KEY,
  "poolId" TEXT NOT NULL REFERENCES "impact_sponsor_pools"("id") ON DELETE CASCADE,
  "studentId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "creditsRedeemed" REAL NOT NULL,
  "awardAmount" REAL NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "studentGpa" REAL NOT NULL,
  "academicStanding" TEXT NOT NULL DEFAULT 'GOOD_STANDING',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "approvedById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "rejectionReason" TEXT,
  "qrVerificationToken" TEXT NOT NULL UNIQUE,
  "claimSignature" TEXT NOT NULL,
  "disbursedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "impact_scholarship_claims_pool_idx" ON "impact_scholarship_claims"("poolId");
CREATE INDEX IF NOT EXISTS "impact_scholarship_claims_student_idx" ON "impact_scholarship_claims"("studentId");
CREATE INDEX IF NOT EXISTS "impact_scholarship_claims_status_idx" ON "impact_scholarship_claims"("status");
CREATE INDEX IF NOT EXISTS "impact_scholarship_claims_token_idx" ON "impact_scholarship_claims"("qrVerificationToken");
