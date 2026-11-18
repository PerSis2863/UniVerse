-- M322: a visitor's accessibility notes with their review of a place (step-free, accessible toilet, lift or ramp,
-- quiet, seating, a short note), JSON (src/lib/travel-access.ts).
ALTER TABLE "travel_reviews" ADD COLUMN "access" TEXT;
