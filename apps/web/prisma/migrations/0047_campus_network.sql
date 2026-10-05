-- Upgrade 9, multi-campus network: campuses (groups of people by email domain), courses shared
-- with partner campuses, exchange students, and communities open to the whole network.
CREATE TABLE "campuses" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "country" TEXT,
  "city" TEXT,
  "logoUrl" TEXT,
  "emailDomains" TEXT NOT NULL DEFAULT '[]',
  "lat" REAL,
  "lng" REAL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
ALTER TABLE "users" ADD COLUMN "campusId" TEXT REFERENCES "campuses" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD COLUMN "networkVisible" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "users_campusId_idx" ON "users"("campusId");
CREATE TABLE "course_campuses" (
  "courseId" TEXT NOT NULL,
  "campusId" TEXT NOT NULL,
  "addedById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("courseId", "campusId"),
  CONSTRAINT "course_campuses_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "course_campuses_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "course_campuses_campusId_idx" ON "course_campuses"("campusId");
ALTER TABLE "student_profiles" ADD COLUMN "exchangeCampusId" TEXT REFERENCES "campuses" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_profiles" ADD COLUMN "exchangeFrom" DATETIME;
ALTER TABLE "student_profiles" ADD COLUMN "exchangeUntil" DATETIME;
CREATE INDEX "student_profiles_exchangeCampusId_idx" ON "student_profiles"("exchangeCampusId");
ALTER TABLE "communities" ADD COLUMN "discoverable" BOOLEAN NOT NULL DEFAULT false;
