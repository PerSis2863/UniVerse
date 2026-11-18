-- M329: when each of a city's days starts (JSON: day index → minutes after midnight), set by the automatic itinerary
-- (an arrival day starts in the afternoon) or by the traveller; days not in it start at 9:00.
ALTER TABLE "travel_trip_stops" ADD COLUMN "starts" TEXT;
