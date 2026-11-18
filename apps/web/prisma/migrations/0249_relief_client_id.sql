-- M316: a Relief request saved on a phone with no signal is sent later from the device's outbox with the id it got
-- there; the same id twice (a retry after a lost answer) makes one post, not two.
ALTER TABLE "relief_posts" ADD COLUMN "clientId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "relief_posts_userId_clientId_key" ON "relief_posts" ("userId", "clientId");
