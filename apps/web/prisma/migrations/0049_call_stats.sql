-- Stage 4 · Phase 0, call health log: one row per person per call (connection numbers only).
CREATE TABLE "call_stats" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "callId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "peers" INTEGER NOT NULL DEFAULT 0,
  "seconds" INTEGER NOT NULL DEFAULT 0,
  "setupMs" INTEGER,
  "worstRttMs" INTEGER,
  "worstLoss" REAL,
  "relay" BOOLEAN NOT NULL DEFAULT false,
  "audioOnly" BOOLEAN NOT NULL DEFAULT false,
  "failure" TEXT,
  "device" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "call_stats_createdAt_idx" ON "call_stats"("createdAt");
