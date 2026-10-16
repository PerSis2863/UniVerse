-- Stage 5 · B3.3: the teaching team's notes on a hand-in, pinned to a place: a box on a page of a PDF or
-- on a picture ({ type: "box", page, x, y, w, h }, fractions of the page), or words in a typed answer
-- ({ type: "text", start, end, quote }). Students see them once their grade is back.
CREATE TABLE "submission_notes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "anchor" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "submission_notes_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "assignment_submissions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "submission_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "submission_notes_submissionId_idx" ON "submission_notes"("submissionId");
