-- M297: what a parent hears about absences in the app, per linked child: EACH (every absence and a falling trend),
-- OFTEN (only frequent absences or a falling trend) or NONE.
ALTER TABLE "guardian_links" ADD COLUMN "alerts" TEXT NOT NULL DEFAULT 'EACH';
