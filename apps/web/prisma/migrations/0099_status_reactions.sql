-- Stage 5 · B7.9: status updates gain reactions (one emoji per viewer, shown to the person who
-- posted), an audience (everyone you chat with, or your close friends only) and a close-friends list.
ALTER TABLE "chat_status_views" ADD COLUMN "reaction" TEXT;
ALTER TABLE "chat_statuses" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'ALL';
CREATE TABLE "close_friends" (
    "userId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId", "friendId"),
    CONSTRAINT "close_friends_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "close_friends_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "close_friends_friendId_idx" ON "close_friends"("friendId");
