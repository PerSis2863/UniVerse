-- Stage 5 · D7: phone clicker for in-person classes. A session per class (rotating join code from
-- its secret, the teacher's notes and the class pulse), students' check-ins (attendance and "I'm
-- lost") and their questions.
CREATE TABLE "classroom_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "transcript" TEXT NOT NULL DEFAULT '[]',
    "pulse" TEXT NOT NULL DEFAULT '[]',
    "classSessionId" TEXT,
    CONSTRAINT "classroom_sessions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "classroom_sessions_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "classroom_sessions_courseId_endedAt_idx" ON "classroom_sessions"("courseId", "endedAt");

CREATE TABLE "classroom_checkins" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "mood" TEXT,
    "moodAt" DATETIME,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "classroom_checkins_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "classroom_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "classroom_checkins_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "classroom_checkins_sessionId_studentId_key" ON "classroom_checkins"("sessionId", "studentId");
CREATE INDEX "classroom_checkins_studentId_idx" ON "classroom_checkins"("studentId");

CREATE TABLE "classroom_questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "answeredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "classroom_questions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "classroom_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "classroom_questions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "classroom_questions_sessionId_idx" ON "classroom_questions"("sessionId");
CREATE INDEX "classroom_questions_studentId_idx" ON "classroom_questions"("studentId");
