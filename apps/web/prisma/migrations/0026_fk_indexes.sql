-- Indexes for lookups that were scanning whole tables. D1 enforces foreign keys, so deleting a
-- message looks for replies to it (replyToId, ON DELETE SET NULL) and deleting an account looks for
-- its reactions and poll votes; without an index each of those reads the entire table. The daily
-- job also deletes expired disappearing messages by expiresAt.
CREATE INDEX IF NOT EXISTS "messages_replyToId_idx" ON "messages"("replyToId");
CREATE INDEX IF NOT EXISTS "messages_expiresAt_idx" ON "messages"("expiresAt");
CREATE INDEX IF NOT EXISTS "message_reactions_userId_idx" ON "message_reactions"("userId");
CREATE INDEX IF NOT EXISTS "poll_votes_userId_idx" ON "poll_votes"("userId");
