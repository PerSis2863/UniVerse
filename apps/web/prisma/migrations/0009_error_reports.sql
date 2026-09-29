-- CreateTable
CREATE TABLE "error_reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "path" TEXT,
    "userAgent" TEXT,
    "lastUserId" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "users" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "diagnosis" TEXT,
    "severity" TEXT,
    "diagnosedAt" DATETIME,
    "resolvedAt" DATETIME,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "error_reports_fingerprint_key" ON "error_reports"("fingerprint");

-- CreateIndex
CREATE INDEX "error_reports_status_lastSeen_idx" ON "error_reports"("status", "lastSeen");

