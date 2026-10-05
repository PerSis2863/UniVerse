-- Upgrade 5, verified volunteering: NGO project shifts and students' QR/GPS check-ins.
CREATE TABLE "volunteer_shifts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "startAt" DATETIME NOT NULL,
  "endAt" DATETIME NOT NULL,
  "location" TEXT,
  "lat" REAL,
  "lng" REAL,
  "radiusM" INTEGER NOT NULL DEFAULT 200,
  "capacity" INTEGER NOT NULL DEFAULT 20,
  "createdById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "volunteer_shifts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ngo_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "volunteer_shifts_projectId_idx" ON "volunteer_shifts"("projectId");
CREATE INDEX "volunteer_shifts_startAt_idx" ON "volunteer_shifts"("startAt");
CREATE TABLE "shift_checkins" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shiftId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "signedUpAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checkInAt" DATETIME,
  "checkOutAt" DATETIME,
  "method" TEXT,
  "lat" REAL,
  "lng" REAL,
  "minutes" INTEGER NOT NULL DEFAULT 0,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "verifiedById" TEXT,
  CONSTRAINT "shift_checkins_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "volunteer_shifts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "shift_checkins_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "shift_checkins_shiftId_studentId_key" ON "shift_checkins"("shiftId", "studentId");
CREATE INDEX "shift_checkins_studentId_idx" ON "shift_checkins"("studentId");
