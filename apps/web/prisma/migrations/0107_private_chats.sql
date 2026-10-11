-- Stage 5 · B7.6: end-to-end encrypted private chats. conversations.private: a one-to-one chat
-- whose messages are encrypted on the devices (the server keeps only ciphertext). chat_device_keys:
-- each device's public key (X25519), so others can encrypt for it.
ALTER TABLE "conversations" ADD COLUMN "private" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "chat_device_keys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_device_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "chat_device_keys_userId_deviceId_key" ON "chat_device_keys"("userId", "deviceId");
