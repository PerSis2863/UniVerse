-- The spending guard's state: this billing month's Cloudflare usage and whether the app is paused.
CREATE TABLE "usage_guard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "resumeAt" DATETIME,
    "meters" TEXT,
    "alerted" TEXT,
    "error" TEXT,
    "checkedAt" DATETIME,
    "pausedAt" DATETIME
);
