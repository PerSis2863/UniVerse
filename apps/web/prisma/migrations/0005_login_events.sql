-- CreateTable
CREATE TABLE "login_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SIGN_IN',
    "method" TEXT,
    "ip" TEXT,
    "country" TEXT,
    "city" TEXT,
    "userAgent" TEXT,
    "device" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "login_events_userId_createdAt_idx" ON "login_events"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "login_events_createdAt_idx" ON "login_events"("createdAt" DESC);

