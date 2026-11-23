-- M445: Ghidra's exam run from the owner console (src/server/ghidra/exam-run.ts): one row per run, and each question's
-- result (the rules it failed and Ghidra's answer, cut short), so the console shows the score card per skill.
CREATE TABLE "ghidra_exam_runs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "per" INTEGER NOT NULL,
  "total" INTEGER NOT NULL,
  "cursor" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" DATETIME
);
CREATE INDEX "ghidra_exam_runs_startedAt_idx" ON "ghidra_exam_runs"("startedAt");
CREATE TABLE "ghidra_exam_answers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "skill" TEXT NOT NULL,
  "n" INTEGER NOT NULL,
  "failed" TEXT NOT NULL,
  "answer" TEXT,
  CONSTRAINT "ghidra_exam_answers_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ghidra_exam_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ghidra_exam_answers_runId_skill_idx" ON "ghidra_exam_answers"("runId", "skill");
