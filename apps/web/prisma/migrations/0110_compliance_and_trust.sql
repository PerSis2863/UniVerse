-- Stage 5 · C5: Compliance and Trust (India DPDP Act 2023, FERPA, COPPA)
ALTER TABLE "organizations" ADD COLUMN "dataRetentionDays" INTEGER NOT NULL DEFAULT 730;

CREATE TABLE IF NOT EXISTS "educational_record_logs" (
  "id" TEXT PRIMARY KEY,
  "studentId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "actorId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "recordType" TEXT NOT NULL,
  "reason" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "accessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "educational_record_logs_studentId_idx" ON "educational_record_logs"("studentId");
CREATE INDEX IF NOT EXISTS "educational_record_logs_accessedAt_idx" ON "educational_record_logs"("accessedAt");

CREATE TABLE IF NOT EXISTS "privacy_grievances" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "requestType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "details" TEXT NOT NULL,
  "nomineeName" TEXT,
  "nomineeEmail" TEXT,
  "resolutionNote" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" DATETIME
);
CREATE INDEX IF NOT EXISTS "privacy_grievances_userId_idx" ON "privacy_grievances"("userId");
