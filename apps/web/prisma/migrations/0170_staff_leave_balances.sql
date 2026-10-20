-- Stage 5 · Q22 (B15.8 leftovers): half-day leave, and leave allowances for balances. Each kind of
-- leave gets a number of days a year for the whole school (0: no limit; JSON), counted in a leave
-- year that starts in a month the school chooses.
ALTER TABLE "staff_leave" ADD COLUMN "halfDay" TEXT;
CREATE TABLE "staff_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leaveDays" TEXT NOT NULL DEFAULT '{"SICK":12,"PERSONAL":10,"TRAINING":0,"OTHER":0}',
    "yearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
