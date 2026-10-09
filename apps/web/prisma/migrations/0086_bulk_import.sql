-- Stage 5 · B15.7: bulk import from CSV with a preview and undo. Each import is kept with what it
-- created and what each changed row was before (as JSON), so it can be undone for 7 days. People
-- invited by an import can be put in classes before they have an account: those enrolments wait
-- here and become real when they join (src/server/modules/applications.ts approveInvited).
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "fileName" TEXT,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "undo" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" DATETIME,
    "undoneById" TEXT,
    CONSTRAINT "import_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "import_batches_createdAt_idx" ON "import_batches"("createdAt");

CREATE TABLE "pending_enrolments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "batchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pending_enrolments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "pending_enrolments_email_courseId_key" ON "pending_enrolments"("email", "courseId");
