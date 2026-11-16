-- M182: a person's connections to outside services (Gmail, Outlook, Slack, Google / Outlook calendars,
-- Google Classroom). The tokens are encrypted (secret-box.ts, AES-256-GCM) and never sent to a browser;
-- mail and events are read live from the service when the person opens them, never copied here.
CREATE TABLE "oauth_connections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "account" TEXT,
    "access" TEXT NOT NULL,
    "refresh" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oauth_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "oauth_connections_userId_service_key" ON "oauth_connections"("userId", "service");
