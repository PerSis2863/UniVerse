-- Stage 5 · Q9: notification settings and the notification centre.
-- users.notifyPrefs: per kind push / daily summary / off, muted courses, the summary's hour and
-- time zone (JSON, src/lib/notify-prefs.ts cleanPrefs); users.digestAt: when the next daily summary
-- is due (null: none). notifications.snoozedUntil: hidden until then, back as unread;
-- notifications.courseId: the course it came from (shown, and muted courses' pushes wait).
ALTER TABLE "users" ADD COLUMN "notifyPrefs" TEXT;
ALTER TABLE "users" ADD COLUMN "digestAt" DATETIME;
CREATE INDEX "users_digestAt_idx" ON "users"("digestAt");
ALTER TABLE "notifications" ADD COLUMN "snoozedUntil" DATETIME;
ALTER TABLE "notifications" ADD COLUMN "courseId" TEXT;
