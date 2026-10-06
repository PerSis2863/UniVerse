-- Stage 4 · 2.13: call history reads call_stats by person and by call.
CREATE INDEX IF NOT EXISTS "call_stats_userId_createdAt_idx" ON "call_stats"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "call_stats_callId_idx" ON "call_stats"("callId");
