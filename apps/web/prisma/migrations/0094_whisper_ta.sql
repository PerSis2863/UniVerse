-- Stage 5 · D2: Whisper TA. In a class call a student asks the TA quietly; it answers from the
-- course materials and the last minutes of what was said (the student's browser sends its own
-- captions). "topic" is the AI's two-to-four-word label of what the question is about: the teacher
-- sees only topics and how many students asked, never who or the question itself. "norm" is the
-- question in a comparable form, so the same question asked again in the class reuses the answer.
-- "addressedAt": the teacher re-explained that topic.
CREATE TABLE "whisper_questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "norm" TEXT NOT NULL,
    "answer" TEXT,
    "citations" TEXT,
    "grounded" BOOLEAN NOT NULL DEFAULT false,
    "live" BOOLEAN NOT NULL DEFAULT false,
    "reused" BOOLEAN NOT NULL DEFAULT false,
    "topic" TEXT,
    "addressedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whisper_questions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "whisper_questions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "whisper_questions_callId_createdAt_idx" ON "whisper_questions"("callId", "createdAt");
CREATE INDEX "whisper_questions_courseId_createdAt_idx" ON "whisper_questions"("courseId", "createdAt");
