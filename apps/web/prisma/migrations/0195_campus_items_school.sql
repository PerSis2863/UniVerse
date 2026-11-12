-- M130: campus info (services, links, events, menus) belongs to a school. Until now every school
-- shared one list. NULL is the main school (people in no school), as on users.
ALTER TABLE "campus_items" ADD COLUMN "organizationId" TEXT;
-- What exists goes to its maker's school (nobody named, or a maker in no school: the main school).
UPDATE "campus_items" SET "organizationId" = (SELECT u."organizationId" FROM "users" u WHERE u."id" = "campus_items"."createdById") WHERE "createdById" IS NOT NULL;
CREATE INDEX "campus_items_organizationId_kind_idx" ON "campus_items"("organizationId", "kind");
