-- Stage 4 · 1.13: community moderation. Automod words per community, timeouts, members' reports
-- of messages, and a log of what moderators did.
ALTER TABLE "communities" ADD COLUMN "automodWords" TEXT;
ALTER TABLE "communities" ADD COLUMN "automodAction" TEXT NOT NULL DEFAULT 'BLOCK';
ALTER TABLE "community_members" ADD COLUMN "timeoutUntil" DATETIME;
CREATE TABLE "community_reports" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "communityId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "reporterId" TEXT,
  "senderId" TEXT NOT NULL,
  "reason" TEXT,
  "excerpt" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolvedById" TEXT,
  "resolvedAt" DATETIME,
  "outcome" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_reports_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "community_reports_communityId_status_idx" ON "community_reports"("communityId", "status");
CREATE UNIQUE INDEX "community_reports_messageId_reporterId_key" ON "community_reports"("messageId", "reporterId");
CREATE TABLE "community_mod_log" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "communityId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "targetId" TEXT,
  "detail" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_mod_log_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "community_mod_log_communityId_createdAt_idx" ON "community_mod_log"("communityId", "createdAt");
