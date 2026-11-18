-- M299: announcements a student confirms ("I've read it"), and a teacher's reminder to those who haven't seen
-- (or confirmed) one, at most every 12 hours.
ALTER TABLE "announcements" ADD COLUMN "needsAck" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "announcements" ADD COLUMN "remindedAt" DATETIME;
ALTER TABLE "announcement_reads" ADD COLUMN "ackAt" DATETIME;
