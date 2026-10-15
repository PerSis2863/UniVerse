-- Stage 5 · B2: a course's teaching team besides its teacher. A co-teacher can do everything the
-- teacher can except change the team, copy or delete the course; a teaching assistant can grade,
-- take attendance and help in the discussion, but not change the course's content.
CREATE TABLE "course_staff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CO_TEACHER',
    "addedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "course_staff_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "course_staff_courseId_userId_key" ON "course_staff"("courseId", "userId");
CREATE INDEX "course_staff_userId_idx" ON "course_staff"("userId");
