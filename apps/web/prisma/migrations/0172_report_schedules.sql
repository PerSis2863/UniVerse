-- Stage 5 · Phase E: scheduled report exports. An admin picks a data export (members, impact points,
-- NGO applications; members with a role and status filter) and how often; the daily jobs save a
-- fresh CSV to their My files, in a "Scheduled reports" folder, and tell them in the app (no email).
CREATE TABLE "report_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filters" TEXT,
    "every" TEXT NOT NULL DEFAULT 'WEEK',
    "lastRunAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_schedules_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "report_schedules_ownerId_idx" ON "report_schedules"("ownerId");
