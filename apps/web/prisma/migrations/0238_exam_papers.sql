-- M291: paper exams. A teacher builds a printed exam from the course's question bank in up to four
-- versions (A–D) with an answer key each and rubrics for written questions; marks are typed per student
-- and can be sent to the gradebook. Everything goes with its course.

CREATE TABLE IF NOT EXISTS "exam_papers" (
  "id" TEXT PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "instructions" TEXT,
  "minutes" INTEGER,
  "versions" TEXT NOT NULL,
  "createdById" TEXT,
  "postedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "exam_papers_courseId_idx" ON "exam_papers" ("courseId");

CREATE TABLE IF NOT EXISTS "exam_marks" (
  "paperId" TEXT NOT NULL REFERENCES "exam_papers"("id") ON DELETE CASCADE,
  "studentId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "version" TEXT NOT NULL,
  "marks" TEXT NOT NULL,
  "score" REAL NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("paperId", "studentId")
);
CREATE INDEX IF NOT EXISTS "exam_marks_studentId_idx" ON "exam_marks" ("studentId");
