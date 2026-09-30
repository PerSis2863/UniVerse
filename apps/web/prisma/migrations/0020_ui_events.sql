-- Pages opened and buttons / links clicked, for the owner console's activity feed (kept 90 days).
CREATE TABLE "ui_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "path" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ui_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ui_events_userId_createdAt_idx" ON "ui_events"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ui_events_createdAt_idx" ON "ui_events"("createdAt" DESC);
