-- M151: Relief, traceable aid (the owner, 10 Nov 2026). An organisation gives each aid box (or pallet) a
-- code; its members log where it is (packed, on the way, delivered) with a town and a note; anyone with
-- the link or QR code follows its trip on a public page, which never shows people; signed-in donors can
-- follow it and are told at each step.

CREATE TABLE IF NOT EXISTS "relief_aid" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL REFERENCES "relief_orgs"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "contents" TEXT NOT NULL,
  "boxes" INTEGER NOT NULL DEFAULT 1,
  "fromPlace" TEXT,
  "toPlace" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PACKED',
  "createdById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "relief_aid_code_key" ON "relief_aid"("code");
CREATE INDEX IF NOT EXISTS "relief_aid_org_idx" ON "relief_aid"("orgId", "createdAt");

CREATE TABLE IF NOT EXISTS "relief_aid_steps" (
  "id" TEXT PRIMARY KEY,
  "aidId" TEXT NOT NULL REFERENCES "relief_aid"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL,
  "place" TEXT,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "relief_aid_steps_aid_idx" ON "relief_aid_steps"("aidId", "createdAt");

CREATE TABLE IF NOT EXISTS "relief_aid_follows" (
  "aidId" TEXT NOT NULL REFERENCES "relief_aid"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("aidId", "userId")
);
