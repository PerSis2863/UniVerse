-- The owner's server switch: live, read-only or maintenance, and a notice shown on every page.
CREATE TABLE "server_control" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL DEFAULT 'LIVE',
    "message" TEXT,
    "until" DATETIME,
    "banner" TEXT,
    "bypass" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT
);
