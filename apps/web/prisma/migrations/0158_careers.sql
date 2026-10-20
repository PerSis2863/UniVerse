-- Stage 5 · Q15 Careers: the application tracker, interview practice, mentor slots, alumni, job alerts.

-- A student's own job and internship applications (UniVerse openings and outside ones).
CREATE TABLE "job_applications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "company" TEXT NOT NULL,
  "url" TEXT,
  "location" TEXT,
  "stage" TEXT NOT NULL DEFAULT 'APPLIED',
  "appliedAt" DATETIME,
  "nextStep" TEXT,
  "nextAt" DATETIME,
  "remindedAt" DATETIME,
  "notes" TEXT,
  "documents" TEXT NOT NULL DEFAULT '[]',
  "internshipId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "job_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "job_applications_internshipId_fkey" FOREIGN KEY ("internshipId") REFERENCES "internships" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "job_applications_userId_idx" ON "job_applications"("userId");
CREATE INDEX "job_applications_nextAt_idx" ON "job_applications"("nextAt");
CREATE UNIQUE INDEX "job_applications_userId_internshipId_key" ON "job_applications"("userId", "internshipId");

-- Answers given in interview practice, with the feedback they got.
CREATE TABLE "interview_answers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "fillers" INTEGER NOT NULL DEFAULT 0,
  "star" TEXT NOT NULL DEFAULT '',
  "score" INTEGER,
  "feedback" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "interview_answers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "interview_answers_userId_createdAt_idx" ON "interview_answers"("userId", "createdAt");

-- Mentors: alumni details, and times they offer for one-to-one calls.
ALTER TABLE "mentor_profiles" ADD COLUMN "isAlumni" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mentor_profiles" ADD COLUMN "gradYear" INTEGER;
ALTER TABLE "mentor_profiles" ADD COLUMN "bio" TEXT;
CREATE TABLE "mentor_slots" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "mentorId" TEXT NOT NULL,
  "startAt" DATETIME NOT NULL,
  "minutes" INTEGER NOT NULL DEFAULT 30,
  "bookingId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mentor_slots_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "mentor_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "mentor_slots_mentorId_startAt_idx" ON "mentor_slots"("mentorId", "startAt");
CREATE UNIQUE INDEX "mentor_slots_bookingId_key" ON "mentor_slots"("bookingId");
ALTER TABLE "mentorship_bookings" ADD COLUMN "slotId" TEXT;
ALTER TABLE "mentorship_bookings" ADD COLUMN "scheduledCallId" TEXT;

-- Job alerts: a new opening that matches my verified skills (on unless turned off).
ALTER TABLE "users" ADD COLUMN "jobAlerts" BOOLEAN NOT NULL DEFAULT true;
-- When students with matching skills were told about an opening (so they're told once).
ALTER TABLE "internships" ADD COLUMN "alertedAt" DATETIME;
