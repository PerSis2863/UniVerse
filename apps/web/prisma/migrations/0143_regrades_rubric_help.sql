-- Stage 5 · B3.5: the student side of assignments.
-- rubricHelp: the rubric in plain words, made once by AI for everyone and kept until the rubric or the
-- instructions change (JSON { key, criteria: [{ id, plain, great, weak }] }).
ALTER TABLE "assignments" ADD COLUMN "rubricHelp" TEXT;

-- A student asking for their grade to be looked at again, and the teaching team's answer.
CREATE TABLE "regrade_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "outcome" TEXT,
    "reply" TEXT,
    "repliedById" TEXT,
    "repliedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repliedAt" DATETIME,
    CONSTRAINT "regrade_requests_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "assignment_submissions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "regrade_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "regrade_requests_submissionId_idx" ON "regrade_requests"("submissionId");
CREATE INDEX "regrade_requests_status_idx" ON "regrade_requests"("status");
