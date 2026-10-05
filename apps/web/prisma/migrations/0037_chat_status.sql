-- Status updates ("stories"): a photo or text card that disappears after 24 hours.
CREATE TABLE "chat_statuses" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'TEXT',
  "body" TEXT NOT NULL DEFAULT '',
  "mediaUrl" TEXT,
  "background" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  CONSTRAINT "chat_statuses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "chat_statuses_userId_expiresAt_idx" ON "chat_statuses"("userId", "expiresAt");
CREATE INDEX "chat_statuses_expiresAt_idx" ON "chat_statuses"("expiresAt");
CREATE TABLE "chat_status_views" (
  "statusId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "viewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("statusId", "userId"),
  CONSTRAINT "chat_status_views_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "chat_statuses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_status_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "chat_status_views_userId_idx" ON "chat_status_views"("userId");
