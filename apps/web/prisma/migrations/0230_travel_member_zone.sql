-- M244: a trip member's home time zone (an IANA name like "Europe/London"), shown as a clock to the others planning
-- the trip only when they choose to share it; null otherwise.
ALTER TABLE "travel_trip_members" ADD COLUMN "zone" TEXT;
