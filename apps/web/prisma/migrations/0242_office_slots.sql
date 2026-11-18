-- M295: office hours you can book. A teacher opens times (like parent meetings: a span cut into meetings of a set
-- length); a student in one of their courses books a free one, or joins its waiting list when it's taken. When a
-- booking is cancelled the first on the waiting list gets the time and is told.
CREATE TABLE IF NOT EXISTS "office_slots" (
  "id" TEXT PRIMARY KEY,
  "teacherId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "startAt" DATETIME NOT NULL,
  "durationMin" INTEGER NOT NULL DEFAULT 15,
  "mode" TEXT NOT NULL DEFAULT 'VIDEO',
  "location" TEXT,
  "studentId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "topic" TEXT,
  "bookedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "office_slots_teacherId_startAt_idx" ON "office_slots" ("teacherId", "startAt");
CREATE INDEX IF NOT EXISTS "office_slots_studentId_idx" ON "office_slots" ("studentId");

CREATE TABLE IF NOT EXISTS "office_waitlist" (
  "slotId" TEXT NOT NULL REFERENCES "office_slots"("id") ON DELETE CASCADE,
  "studentId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "topic" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("slotId", "studentId")
);
CREATE INDEX IF NOT EXISTS "office_waitlist_studentId_idx" ON "office_waitlist" ("studentId");
