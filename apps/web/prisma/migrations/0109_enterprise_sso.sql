-- Stage 5 · C3: Enterprise SSO & University Logins
ALTER TABLE "organizations" ADD COLUMN "ssoEnabled" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "organizations" ADD COLUMN "ssoProvider" TEXT;
ALTER TABLE "organizations" ADD COLUMN "ssoDomain" TEXT;
ALTER TABLE "organizations" ADD COLUMN "ssoTenantId" TEXT;
ALTER TABLE "organizations" ADD COLUMN "ssoEnforced" BOOLEAN NOT NULL DEFAULT 0;
