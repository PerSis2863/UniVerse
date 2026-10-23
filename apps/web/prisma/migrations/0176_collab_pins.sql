-- M17: the items each person pins to the top of Collaborate → Home (boards, documents, task boards,
-- code rooms, files), as JSON (src/lib/collab-pins.ts cleanPins).
ALTER TABLE "users" ADD COLUMN "collabPins" TEXT;
