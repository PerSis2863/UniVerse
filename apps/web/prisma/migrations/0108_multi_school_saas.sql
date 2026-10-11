-- Stage 5 · C2: Multi-school SaaS: organizations get subdomains, custom domains, branding, and seat limits.
ALTER TABLE "organizations" ADD COLUMN "slug" TEXT;
ALTER TABLE "organizations" ADD COLUMN "customDomain" TEXT;
ALTER TABLE "organizations" ADD COLUMN "brandColor" TEXT;
ALTER TABLE "organizations" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "organizations" ADD COLUMN "appTitle" TEXT;
ALTER TABLE "organizations" ADD COLUMN "tagline" TEXT;
ALTER TABLE "organizations" ADD COLUMN "trialEndsAt" DATETIME;
ALTER TABLE "organizations" ADD COLUMN "seats" INTEGER NOT NULL DEFAULT 50;

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_customDomain_key" ON "organizations"("customDomain");

-- Users and campuses can be scoped to an organization.
ALTER TABLE "users" ADD COLUMN "organizationId" TEXT REFERENCES "organizations"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "users_organizationId_idx" ON "users"("organizationId");

ALTER TABLE "campuses" ADD COLUMN "organizationId" TEXT REFERENCES "organizations"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "campuses_organizationId_idx" ON "campuses"("organizationId");
