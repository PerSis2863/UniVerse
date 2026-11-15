-- M191: a room belongs to a school (NULL: the main school, as on users). Until now every school's
-- admins and people saw and booked one list of rooms. A room in a building goes to that building's
-- school (M187); the rest stay with the main school. Bookings follow their room.
ALTER TABLE "rooms" ADD COLUMN "organizationId" TEXT;
UPDATE "rooms" SET "organizationId" = (SELECT b."organizationId" FROM "campus_buildings" b WHERE b."id" = "rooms"."buildingId") WHERE "buildingId" IS NOT NULL;
CREATE INDEX "rooms_organizationId_idx" ON "rooms"("organizationId");
