-- Upgrade 7, campus super-app: event RSVPs with QR check-in and seat limits, lost & found, and a
-- club's own space (a Community).
ALTER TABLE "campus_items" ADD COLUMN "capacity" INTEGER;
CREATE TABLE "event_rsvps" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'GOING',
  "checkedInAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_rsvps_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "campus_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_rsvps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "event_rsvps_itemId_userId_key" ON "event_rsvps"("itemId", "userId");
CREATE INDEX "event_rsvps_userId_idx" ON "event_rsvps"("userId");
CREATE TABLE "lost_found_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "photoUrl" TEXT,
  "location" TEXT,
  "reporterId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  CONSTRAINT "lost_found_items_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "lost_found_items_status_expiresAt_idx" ON "lost_found_items"("status", "expiresAt");
CREATE INDEX "lost_found_items_reporterId_idx" ON "lost_found_items"("reporterId");
ALTER TABLE "associations" ADD COLUMN "communityId" TEXT;
