-- M184: an LMS connection belongs to a school (NULL: the main school, as on users). Until now every
-- school's admin could see, switch off and delete every school's LMS connections.
ALTER TABLE "lti_platforms" ADD COLUMN "organizationId" TEXT;
-- What exists goes to the school of the admin who connected it (the activity log has who).
UPDATE "lti_platforms" SET "organizationId" = (
  SELECT u."organizationId" FROM "audit_logs" a JOIN "users" u ON u."id" = a."actorId"
  WHERE a."action" = 'lti.platform_added' AND a."targetId" = "lti_platforms"."id" LIMIT 1);
CREATE INDEX "lti_platforms_organizationId_idx" ON "lti_platforms"("organizationId");
