-- M475: Hyperion Signals → IoT. A person's channels (up to 10), each with up to 8 named fields and a write key a
-- device uses over HTTPS (only its SHA-256 is kept: the key itself is shown once), and the readings devices send
-- (one row per reading, the oldest dropped past 20,000 a channel).
CREATE TABLE "iot_channels" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "fields" TEXT NOT NULL DEFAULT '[]',
  "keyHash" TEXT NOT NULL,
  "keyHint" TEXT NOT NULL,
  "entries" INTEGER NOT NULL DEFAULT 0,
  "lastEntryAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "iot_channels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "iot_channels_userId_idx" ON "iot_channels"("userId");
CREATE UNIQUE INDEX "iot_channels_keyHash_key" ON "iot_channels"("keyHash");
CREATE TABLE "iot_entries" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "channelId" TEXT NOT NULL,
  "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "f1" REAL, "f2" REAL, "f3" REAL, "f4" REAL, "f5" REAL, "f6" REAL, "f7" REAL, "f8" REAL,
  CONSTRAINT "iot_entries_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "iot_channels" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "iot_entries_channelId_id_idx" ON "iot_entries"("channelId", "id");
