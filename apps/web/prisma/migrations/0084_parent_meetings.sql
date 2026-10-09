-- Stage 5 · B16.3: parent–teacher meetings. A teacher opens times (one row per slot: start,
-- length, video or in person and where); a parent books a free one for a child of theirs in the
-- teacher's classes, with what they'd like to talk about. Video meetings use the app's calls
-- (call id "pm_<slot id>"). About 15 minutes before, both are reminded (the 15-minute cron).
-- Afterwards the teacher keeps private notes and can share a summary with the parent. Each side's
-- time zone (from their device) is kept so notifications show times the way each reads them.
CREATE TABLE "parent_meetings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 15,
    "mode" TEXT NOT NULL DEFAULT 'VIDEO',
    "location" TEXT,
    "teacherTimeZone" TEXT,
    "guardianId" TEXT,
    "studentId" TEXT,
    "topic" TEXT,
    "parentTimeZone" TEXT,
    "bookedAt" DATETIME,
    "remindedAt" DATETIME,
    "notes" TEXT,
    "summary" TEXT,
    "summarySentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parent_meetings_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "parent_meetings_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "parent_meetings_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "parent_meetings_teacherId_startAt_idx" ON "parent_meetings"("teacherId", "startAt");
CREATE INDEX "parent_meetings_guardianId_idx" ON "parent_meetings"("guardianId");
CREATE INDEX "parent_meetings_startAt_remindedAt_idx" ON "parent_meetings"("startAt", "remindedAt");
