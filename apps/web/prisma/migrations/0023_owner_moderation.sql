-- Owner console: mute a person in chat for a while, turn app features off, and words that alert
-- the owner when they appear in a chat.
ALTER TABLE "users" ADD COLUMN "chatMutedUntil" DATETIME;
ALTER TABLE "server_control" ADD COLUMN "switches" TEXT;
ALTER TABLE "server_control" ADD COLUMN "watchWords" TEXT;
