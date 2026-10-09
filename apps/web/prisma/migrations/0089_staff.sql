-- Stage 5 · B15.8: staff. Teachers ask for leave (days, type, reason) and mark themselves in each
-- day; managers (admins, or staff with the staff.manage permission) approve leave, see who's in,
-- and plan cover: each class an absent teacher would miss on a date gets a teacher who's free then.
-- Dates are the school's calendar days (YYYY-MM-DD) as the person's device sees them.
CREATE TABLE "staff_leave" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PERSONAL',
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "decisionNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_leave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "staff_leave_userId_idx" ON "staff_leave"("userId");
CREATE INDEX "staff_leave_status_fromDate_idx" ON "staff_leave"("status", "fromDate");

CREATE TABLE "staff_covers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "absentTeacherId" TEXT NOT NULL,
    "coverTeacherId" TEXT,
    "leaveId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_covers_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "timetable_slots" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staff_covers_absentTeacherId_fkey" FOREIGN KEY ("absentTeacherId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staff_covers_coverTeacherId_fkey" FOREIGN KEY ("coverTeacherId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "staff_covers_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "staff_leave" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "staff_covers_date_slotId_key" ON "staff_covers"("date", "slotId");
CREATE INDEX "staff_covers_coverTeacherId_date_idx" ON "staff_covers"("coverTeacherId", "date");

CREATE TABLE "staff_attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "inAt" DATETIME,
    "outAt" DATETIME,
    CONSTRAINT "staff_attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "staff_attendance_userId_date_key" ON "staff_attendance"("userId", "date");
CREATE INDEX "staff_attendance_date_idx" ON "staff_attendance"("date");
