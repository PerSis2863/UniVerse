-- Stage 5 · B15.1: admissions. An admin opens an admission round (dates, the classes admitted
-- students join, an application form made of fields, an offer letter template). Families apply on
-- a public page without an account and follow their application with a private link (no email is
-- sent). Admins move applications through stages, score them (one score per admin), keep notes,
-- make offers the family accepts or declines on their link, and enrol accepted students: a
-- pre-approved invitation and their classes waiting for them (pending_enrolments, 0086).
CREATE TABLE "admission_rounds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT,
    "courseIds" TEXT NOT NULL DEFAULT '[]',
    "fields" TEXT NOT NULL DEFAULT '[]',
    "offerTemplate" TEXT,
    "opensAt" DATETIME NOT NULL,
    "closesAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admission_rounds_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "admission_rounds_slug_key" ON "admission_rounds"("slug");

CREATE TABLE "admission_applications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "studentDob" TEXT,
    "studentEmail" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "relation" TEXT,
    "answers" TEXT NOT NULL DEFAULT '{}',
    "files" TEXT NOT NULL DEFAULT '[]',
    "stage" TEXT NOT NULL DEFAULT 'RECEIVED',
    "message" TEXT,
    "offerLetter" TEXT,
    "offerSentAt" DATETIME,
    "offerExpiresAt" DATETIME,
    "respondedAt" DATETIME,
    "enrolledAt" DATETIME,
    "history" TEXT NOT NULL DEFAULT '[]',
    "ipHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admission_applications_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "admission_rounds" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "admission_applications_ref_key" ON "admission_applications"("ref");
CREATE UNIQUE INDEX "admission_applications_token_key" ON "admission_applications"("token");
CREATE INDEX "admission_applications_roundId_stage_idx" ON "admission_applications"("roundId", "stage");
CREATE INDEX "admission_applications_ipHash_createdAt_idx" ON "admission_applications"("ipHash", "createdAt");

CREATE TABLE "admission_reviews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admission_reviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "admission_applications" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "admission_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "admission_reviews_applicationId_reviewerId_key" ON "admission_reviews"("applicationId", "reviewerId");
