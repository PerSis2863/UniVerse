-- Migration 0115: Learning Analytics Warehouse & xAPI Statements (Stage 5 · C8)
-- Anonymized learning event warehousing, xAPI statement stream, comparative term cohort analysis,
-- and governed research data requests.

CREATE TABLE IF NOT EXISTS "xapi_statements" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT REFERENCES "organizations"("id") ON DELETE SET NULL,
  "actorId" TEXT NOT NULL,
  "actorType" TEXT NOT NULL DEFAULT 'USER',
  "verb" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "objectId" TEXT NOT NULL,
  "objectName" TEXT,
  "resultScore" REAL,
  "resultSuccess" BOOLEAN,
  "resultCompletion" BOOLEAN,
  "durationSeconds" REAL,
  "contextCourseId" TEXT REFERENCES "courses"("id") ON DELETE SET NULL,
  "contextSessionId" TEXT,
  "rawPayload" TEXT,
  "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "storedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "xapi_statements_org_idx" ON "xapi_statements"("organizationId");
CREATE INDEX IF NOT EXISTS "xapi_statements_actor_idx" ON "xapi_statements"("actorId");
CREATE INDEX IF NOT EXISTS "xapi_statements_verb_idx" ON "xapi_statements"("verb");
CREATE INDEX IF NOT EXISTS "xapi_statements_object_idx" ON "xapi_statements"("objectType", "objectId");
CREATE INDEX IF NOT EXISTS "xapi_statements_course_idx" ON "xapi_statements"("contextCourseId");
CREATE INDEX IF NOT EXISTS "xapi_statements_timestamp_idx" ON "xapi_statements"("timestamp");

CREATE TABLE IF NOT EXISTS "analytics_exports" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "generatedById" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "periodStart" DATETIME NOT NULL,
  "periodEnd" DATETIME NOT NULL,
  "format" TEXT NOT NULL DEFAULT 'CSV',
  "anonymized" BOOLEAN NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'GENERATED',
  "recordCount" INTEGER NOT NULL DEFAULT 0,
  "fileUrl" TEXT,
  "fileSizeBytes" INTEGER NOT NULL DEFAULT 0,
  "sha256Hash" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "analytics_exports_org_idx" ON "analytics_exports"("organizationId");
CREATE INDEX IF NOT EXISTS "analytics_exports_created_idx" ON "analytics_exports"("createdAt");

CREATE TABLE IF NOT EXISTS "research_data_requests" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "requestedById" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "institution" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "datasetScope" TEXT NOT NULL DEFAULT 'LEARNING_OUTCOMES',
  "anonymized" BOOLEAN NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "approvedById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "rejectionReason" TEXT,
  "expiresAt" DATETIME,
  "accessToken" TEXT UNIQUE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "research_data_requests_org_idx" ON "research_data_requests"("organizationId");
CREATE INDEX IF NOT EXISTS "research_data_requests_status_idx" ON "research_data_requests"("status");
