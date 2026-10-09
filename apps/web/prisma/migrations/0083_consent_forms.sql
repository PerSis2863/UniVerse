-- Stage 5 · B16.4: consent forms with an e-signature. The school (or a teacher, for one of their
-- classes) sends a form; a parent answers for each child they're linked to (yes or no, a note) and
-- signs with their typed name (and, if they like, a drawn signature). One answer per child per form;
-- it can be changed while the form is open.
CREATE TABLE "consent_forms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "attachmentName" TEXT,
    "courseId" TEXT,
    "dueAt" DATETIME,
    "allowDecline" BOOLEAN NOT NULL DEFAULT true,
    "closedAt" DATETIME,
    "remindedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consent_forms_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "consent_forms_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "consent_forms_courseId_idx" ON "consent_forms"("courseId");
CREATE INDEX "consent_forms_createdById_idx" ON "consent_forms"("createdById");

CREATE TABLE "consent_responses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "note" TEXT,
    "signedName" TEXT NOT NULL,
    "signature" TEXT,
    "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consent_responses_formId_fkey" FOREIGN KEY ("formId") REFERENCES "consent_forms" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "consent_responses_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "consent_responses_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "consent_responses_formId_studentId_key" ON "consent_responses"("formId", "studentId");
CREATE INDEX "consent_responses_guardianId_idx" ON "consent_responses"("guardianId");
