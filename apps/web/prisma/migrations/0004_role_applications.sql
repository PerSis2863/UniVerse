-- CreateTable
CREATE TABLE "role_applications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "requestedRole" TEXT NOT NULL DEFAULT 'TEACHER',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'SIGNUP',
    "institution" TEXT,
    "department" TEXT,
    "position" TEXT,
    "staffId" TEXT,
    "workEmail" TEXT,
    "phone" TEXT,
    "subjects" TEXT,
    "experienceYears" INTEGER,
    "profileUrl" TEXT,
    "message" TEXT,
    "proofUrl" TEXT,
    "proofName" TEXT,
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "submittedAt" DATETIME,
    "history" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "role_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "role_applications_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "role_applications_status_submittedAt_idx" ON "role_applications"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "role_applications_userId_createdAt_idx" ON "role_applications"("userId", "createdAt");

