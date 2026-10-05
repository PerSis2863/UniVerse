-- Upgrade 3, early help with an action plan: study plans teachers make from early-warning flags,
-- with a 7-day follow-up and its outcome.
CREATE TABLE "support_plans" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "flagId" TEXT,
  "studentId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "message" TEXT,
  "stepsDone" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "followUpAt" DATETIME NOT NULL,
  "followUpNotifiedAt" DATETIME,
  "followUpDoneAt" DATETIME,
  "startScore" INTEGER,
  "endScore" INTEGER,
  "outcome" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "support_plans_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "student_risk_flags" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "support_plans_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "support_plans_studentId_status_idx" ON "support_plans"("studentId", "status");
CREATE INDEX "support_plans_status_followUpAt_idx" ON "support_plans"("status", "followUpAt");
CREATE INDEX "support_plans_flagId_idx" ON "support_plans"("flagId");
ALTER TABLE "student_risk_flags" ADD COLUMN "followUpScore" INTEGER;
