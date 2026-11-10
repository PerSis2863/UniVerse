-- M148: Relief's shelter and supply board (the owner, 10 Nov 2026). An organisation's live status:
-- open now, beds free out of its beds, water, food and phone charging (YES, LOW or NO), a short note
-- and when it was said. Everyone in Relief sees the places that said something in the last week.

ALTER TABLE "relief_orgs" ADD COLUMN "openNow" INTEGER;
ALTER TABLE "relief_orgs" ADD COLUMN "bedsFree" INTEGER;
ALTER TABLE "relief_orgs" ADD COLUMN "bedsTotal" INTEGER;
ALTER TABLE "relief_orgs" ADD COLUMN "water" TEXT;
ALTER TABLE "relief_orgs" ADD COLUMN "food" TEXT;
ALTER TABLE "relief_orgs" ADD COLUMN "power" TEXT;
ALTER TABLE "relief_orgs" ADD COLUMN "statusNote" TEXT;
ALTER TABLE "relief_orgs" ADD COLUMN "statusAt" DATETIME;
CREATE INDEX IF NOT EXISTS "relief_orgs_status_idx" ON "relief_orgs"("statusAt");
