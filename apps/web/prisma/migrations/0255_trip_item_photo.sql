-- M327: a trip's places in the itinerary look: a photo (a Wikimedia Commons file from the guide's listing) and
-- when the traveller ticked it off.
ALTER TABLE "travel_trip_items" ADD COLUMN "photo" TEXT;
ALTER TABLE "travel_trip_items" ADD COLUMN "doneAt" DATETIME;
