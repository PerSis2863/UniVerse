-- Security fix (22 Oct 2026): a BeeSafe report remembers its school, so an anonymous report (which
-- keeps no reporter) still reaches that school's admins and no other school's
-- (src/server/services/safety.service.ts). Older reports (empty) belong to the main school.
ALTER TABLE "safety_alerts" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "safety_alerts_organizationId_idx" ON "safety_alerts"("organizationId");
