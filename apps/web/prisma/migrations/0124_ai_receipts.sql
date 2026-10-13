-- Stage 5 · D12: honest AI receipts. A private record of the AI help each person used in UniVerse
-- (tutor, assistant, writing helper…: what kind, a short excerpt, when; kept 180 days, seen only by
-- them unless they attach it to an assignment); each assignment's AI rule (FREE: free to use,
-- RECEIPT: allowed with a receipt, NONE: not allowed); and the receipt or declaration a student
-- attaches when handing in (JSON).
CREATE TABLE "ai_uses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "courseId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_uses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ai_uses_userId_createdAt_idx" ON "ai_uses"("userId", "createdAt");
ALTER TABLE "assignments" ADD COLUMN "aiPolicy" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "assignment_submissions" ADD COLUMN "aiReceipt" TEXT;
