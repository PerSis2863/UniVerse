-- Messages part B/C: communities with channels, threads, presence and custom status, reminders,
-- favourite people.
CREATE TABLE "communities" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT NOT NULL DEFAULT '#4f46e5',
  "inviteCode" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "communities_inviteCode_key" ON "communities"("inviteCode");
CREATE TABLE "community_members" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "communityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_members_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "community_members_communityId_userId_key" ON "community_members"("communityId", "userId");
CREATE INDEX "community_members_userId_idx" ON "community_members"("userId");
ALTER TABLE "conversations" ADD COLUMN "communityId" TEXT REFERENCES "communities" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD COLUMN "channelKind" TEXT;
ALTER TABLE "conversations" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "conversations" ADD COLUMN "slowModeSec" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "conversations_communityId_idx" ON "conversations"("communityId");
ALTER TABLE "messages" ADD COLUMN "threadId" TEXT;
CREATE INDEX "messages_threadId_idx" ON "messages"("threadId");
ALTER TABLE "users" ADD COLUMN "presence" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "users" ADD COLUMN "statusText" TEXT;
ALTER TABLE "users" ADD COLUMN "statusEmoji" TEXT;
ALTER TABLE "users" ADD COLUMN "statusUntil" DATETIME;
CREATE TABLE "chat_reminders" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT,
  "text" TEXT NOT NULL,
  "dueAt" DATETIME NOT NULL,
  "sentAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "chat_reminders_dueAt_idx" ON "chat_reminders"("dueAt");
CREATE INDEX "chat_reminders_userId_idx" ON "chat_reminders"("userId");
CREATE TABLE "favorite_people" (
  "userId" TEXT NOT NULL,
  "favoriteId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "favoriteId")
);
