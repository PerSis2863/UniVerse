-- M429: answers from Ghidra that people reported (wrong, unsafe or unkind), for the owner console's Moderation, so
-- Ghidra's guardrails can be adjusted over time. Only what the person chose to send: their question and Ghidra's answer.
CREATE TABLE "ghidra_reports" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" DATETIME,
  CONSTRAINT "ghidra_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ghidra_reports_resolvedAt_createdAt_idx" ON "ghidra_reports"("resolvedAt", "createdAt");
CREATE INDEX "ghidra_reports_userId_createdAt_idx" ON "ghidra_reports"("userId", "createdAt");
