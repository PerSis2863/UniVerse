-- M247: how the travellers get to this city from the one before (plane, train, bus, car, ferry), for the trip's
-- footprint; null means the likely way (a plane far or over sea, a train otherwise).
ALTER TABLE "travel_trip_stops" ADD COLUMN "mode" TEXT;
