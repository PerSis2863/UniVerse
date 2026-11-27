-- M522: Hyperion Signals → IoT alerts. A rule on one of a channel's fields (above or below a value); when a device's
-- reading breaks it, the channel's owner is told in the app (and by push), at most once per the rule's quiet time.
CREATE TABLE "iot_alerts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "channelId" TEXT NOT NULL,
  "field" INTEGER NOT NULL,
  "op" TEXT NOT NULL,
  "value" REAL NOT NULL,
  "note" TEXT,
  "quietMinutes" INTEGER NOT NULL DEFAULT 15,
  "lastFiredAt" DATETIME,
  "fired" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "iot_alerts_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "iot_channels" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "iot_alerts_channelId_idx" ON "iot_alerts"("channelId");
