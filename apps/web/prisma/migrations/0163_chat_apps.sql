-- Stage 5 · Q20 Chat apps: a school's own slash commands. Typing "/<command>" in a chat sends it,
-- signed, to the app's address, and its answer is posted in the chat (src/server/chat-apps.ts).
CREATE TABLE "chat_apps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "commands" TEXT NOT NULL DEFAULT '[]',
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "lastCalledAt" DATETIME,
    "lastStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "chat_apps_organizationId_idx" ON "chat_apps"("organizationId");
