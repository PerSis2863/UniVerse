-- M152: emails for the new Relief and Trace alerts (the owner, 10 Nov 2026: "please do this"). Nearby-need
-- alerts can come often, so helpers choose them by email on their alert settings (off by default); the
-- rarer ones (an emergency near you, someone who is safe, an aid box you follow, a take-back received)
-- follow each person's own email setting.
ALTER TABLE "relief_watches" ADD COLUMN "email" BOOLEAN NOT NULL DEFAULT 0;
