-- M106: Relief for organisations (the owner's seven ideas, 25 Oct 2026: "organisation accounts for
-- Relief (NGOs, supplies, volunteer shifts)"). An organisation (an NGO, a food bank, a shelter, a
-- community group) has members with a role, a stock of supplies with a log of every change, and
-- volunteer shifts people sign up for. A need can be taken for an organisation, and a post made in
-- its name. Its base is rounded like posts (about 500 m).

CREATE TABLE IF NOT EXISTS "relief_orgs" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'NGO',
  "about" TEXT,
  "place" TEXT,
  "lat" REAL,
  "lng" REAL,
  "code" TEXT NOT NULL UNIQUE,
  "createdById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "relief_org_members" (
  "orgId" TEXT NOT NULL REFERENCES "relief_orgs"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL DEFAULT 'VOLUNTEER',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("orgId", "userId")
);
CREATE INDEX IF NOT EXISTS "relief_org_members_user_idx" ON "relief_org_members"("userId");

CREATE TABLE IF NOT EXISTS "relief_supplies" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL REFERENCES "relief_orgs"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'OTHER',
  "unit" TEXT NOT NULL DEFAULT 'items',
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "lowAt" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "relief_supplies_org_idx" ON "relief_supplies"("orgId");

CREATE TABLE IF NOT EXISTS "relief_supply_moves" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL REFERENCES "relief_orgs"("id") ON DELETE CASCADE,
  "supplyId" TEXT NOT NULL REFERENCES "relief_supplies"("id") ON DELETE CASCADE,
  "userId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "change" INTEGER NOT NULL,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "relief_supply_moves_org_idx" ON "relief_supply_moves"("orgId", "createdAt");

CREATE TABLE IF NOT EXISTS "relief_shifts" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL REFERENCES "relief_orgs"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "details" TEXT,
  "place" TEXT,
  "startsAt" DATETIME NOT NULL,
  "endsAt" DATETIME NOT NULL,
  "slots" INTEGER NOT NULL DEFAULT 1,
  "filled" INTEGER NOT NULL DEFAULT 0,
  "membersOnly" BOOLEAN NOT NULL DEFAULT 0,
  "createdById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "relief_shifts_org_idx" ON "relief_shifts"("orgId", "startsAt");
CREATE INDEX IF NOT EXISTS "relief_shifts_start_idx" ON "relief_shifts"("startsAt");

CREATE TABLE IF NOT EXISTS "relief_shift_signups" (
  "shiftId" TEXT NOT NULL REFERENCES "relief_shifts"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("shiftId", "userId")
);
CREATE INDEX IF NOT EXISTS "relief_shift_signups_user_idx" ON "relief_shift_signups"("userId");

-- A post made in an organisation's name, and a need an organisation took on.
ALTER TABLE "relief_posts" ADD COLUMN "orgId" TEXT REFERENCES "relief_orgs"("id") ON DELETE SET NULL;
ALTER TABLE "relief_posts" ADD COLUMN "helperOrgId" TEXT REFERENCES "relief_orgs"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "relief_posts_helper_org_idx" ON "relief_posts"("helperOrgId");
