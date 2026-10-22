-- Security fix (22 Oct 2026): an invitation remembers which school sent it, so only that school's
-- admins see, renew or cancel it, and the person joins that school when they sign up
-- (src/server/school-scope.ts). Older invitations (empty) belong to the main school.
ALTER TABLE "invitations" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "invitations_organizationId_idx" ON "invitations"("organizationId");
