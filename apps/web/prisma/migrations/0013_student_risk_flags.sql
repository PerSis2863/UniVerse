-- CreateTable
CREATE TABLE "student_risk_flags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "reasons" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "handledById" TEXT,
    "handledByName" TEXT,
    "handledAt" DATETIME,
    "handledScore" INTEGER,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "student_risk_flags_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "student_risk_flags_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "student_risk_flags_courseId_idx" ON "student_risk_flags"("courseId");

-- CreateIndex
CREATE INDEX "student_risk_flags_status_idx" ON "student_risk_flags"("status");

-- CreateIndex
CREATE UNIQUE INDEX "student_risk_flags_studentId_courseId_key" ON "student_risk_flags"("studentId", "courseId");

