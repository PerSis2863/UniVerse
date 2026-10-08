-- Stage 5 · B15.3: report cards. A round (e.g. "Term 1 2026–27", a date range) and one card per
-- student: each course's weighted final and letter, attendance, and an optional comment. Drafts
-- until the school publishes the round; then students see them in Grades.
CREATE TABLE "report_card_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "fromDate" DATETIME NOT NULL,
    "toDate" DATETIME NOT NULL,
    "school" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "report_cards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "comment" TEXT,
    "average" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "report_cards_runId_fkey" FOREIGN KEY ("runId") REFERENCES "report_card_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "report_cards_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "report_cards_runId_studentId_key" ON "report_cards"("runId", "studentId");
CREATE INDEX "report_cards_studentId_idx" ON "report_cards"("studentId");
