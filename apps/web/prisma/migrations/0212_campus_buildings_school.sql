-- M187: a building on the campus map belongs to a school (NULL: the main school, as on users). Until
-- now the school's own campus map (buildings with no campusId) was one map for every school, and any
-- school's admin could move or delete any building.
ALTER TABLE "campus_buildings" ADD COLUMN "organizationId" TEXT;
-- A building on a campus of the network goes to that campus's school; the rest stay with the main school.
UPDATE "campus_buildings" SET "organizationId" = (SELECT c."organizationId" FROM "campuses" c WHERE c."id" = "campus_buildings"."campusId") WHERE "campusId" IS NOT NULL;
CREATE INDEX "campus_buildings_organizationId_idx" ON "campus_buildings"("organizationId");
