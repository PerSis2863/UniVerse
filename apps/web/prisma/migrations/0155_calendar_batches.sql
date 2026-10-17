-- Stage 5 · Q12: events made together carry the same batch, so they can be replaced or removed
-- together: a published exam timetable ("exam:<name>"), an imported calendar file ("ics:<name>"),
-- a repeating personal event ("repeat:<id>").
ALTER TABLE "calendar_events" ADD COLUMN "batch" TEXT;
CREATE INDEX "calendar_events_batch_idx" ON "calendar_events"("batch");
