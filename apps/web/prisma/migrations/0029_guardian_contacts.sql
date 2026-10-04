-- Parents and guardians a student chose to keep informed (src/server/guardians.ts): a weekly
-- progress email and absence alerts, only after the guardian confirms from the first email.
CREATE TABLE "guardian_contacts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "studentId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "token" TEXT NOT NULL,
  "confirmedAt" DATETIME,
  "weeklyDigest" BOOLEAN NOT NULL DEFAULT true,
  "absenceAlerts" BOOLEAN NOT NULL DEFAULT true,
  "lastDigestAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guardian_contacts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "guardian_contacts_token_key" ON "guardian_contacts"("token");
CREATE UNIQUE INDEX "guardian_contacts_studentId_email_key" ON "guardian_contacts"("studentId", "email");
CREATE INDEX "guardian_contacts_confirmedAt_idx" ON "guardian_contacts"("confirmedAt");
