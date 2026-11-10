-- M154: aid boxes on a map, and helpers' names by choice (the owner, 10 Nov 2026: "please do this").
-- Each step of a box's trip can carry where it was, rounded to about 500 m like every Relief position
-- (never an exact spot: aid in transit and the people with it stay safe), and the first name of the
-- member who logged it, only when they choose to show it. People who receive aid are never shown.
ALTER TABLE "relief_aid_steps" ADD COLUMN "lat" REAL;
ALTER TABLE "relief_aid_steps" ADD COLUMN "lng" REAL;
ALTER TABLE "relief_aid_steps" ADD COLUMN "byName" TEXT;
