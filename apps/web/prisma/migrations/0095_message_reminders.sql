-- Stage 5 · B7.1: message reminders and the Later list. A reminder can now be about a message
-- ("remind me about this in an hour"), opening that message when it's due, and it stays on the
-- Later list until it's marked done.
ALTER TABLE "chat_reminders" ADD COLUMN "messageId" TEXT;
ALTER TABLE "chat_reminders" ADD COLUMN "doneAt" DATETIME;
CREATE INDEX "chat_reminders_userId_doneAt_idx" ON "chat_reminders"("userId", "doneAt");
