-- M150: Relief, the "I'm safe" check-in (the owner, 10 Nov 2026). An organisation's coordinators declare
-- an emergency for an area for a while (relief_incidents); anyone can say they're safe and pick who is
-- told, only among the people they already have a conversation with (relief_safe, relief_safe_told).
-- Nobody else sees who is safe. Positions rounded like posts (about 500 m).

CREATE TABLE IF NOT EXISTS "relief_incidents" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL REFERENCES "relief_orgs"("id") ON DELETE CASCADE,
  "createdById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "place" TEXT,
  "lat" REAL NOT NULL,
  "lng" REAL NOT NULL,
  "radiusKm" REAL NOT NULL DEFAULT 20,
  "endsAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "relief_incidents_ends_idx" ON "relief_incidents"("endsAt");
CREATE INDEX IF NOT EXISTS "relief_incidents_org_idx" ON "relief_incidents"("orgId");

CREATE TABLE IF NOT EXISTS "relief_safe" (
  "incidentId" TEXT NOT NULL REFERENCES "relief_incidents"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("incidentId", "userId")
);

CREATE TABLE IF NOT EXISTS "relief_safe_told" (
  "incidentId" TEXT NOT NULL REFERENCES "relief_incidents"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "toUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("incidentId", "userId", "toUserId")
);
CREATE INDEX IF NOT EXISTS "relief_safe_told_to_idx" ON "relief_safe_told"("toUserId", "incidentId");
