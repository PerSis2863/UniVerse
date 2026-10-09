-- Stage 5 · B16.1: parent and guardian accounts (role GUARDIAN; users.role is TEXT, so no change
-- there). A student makes a one-time code, the guardian enters it, and the two are linked.
CREATE TABLE "guardian_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guardianId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "relation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guardian_links_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "guardian_links_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "guardian_links_guardianId_studentId_key" ON "guardian_links"("guardianId", "studentId");
CREATE INDEX "guardian_links_studentId_idx" ON "guardian_links"("studentId");

CREATE TABLE "guardian_invites" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guardian_invites_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "guardian_invites_studentId_idx" ON "guardian_invites"("studentId");
