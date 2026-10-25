-- Proof for Green actions (25 Oct 2026, the owner picked "proof for Green actions and challenges"):
-- a photo with the action, and a teammate who confirms it. Only confirmed actions count for the
-- weekly challenge and the leaderboards.
ALTER TABLE "green_actions" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "green_actions" ADD COLUMN "verifiedBy" TEXT;
ALTER TABLE "green_actions" ADD COLUMN "verifiedAt" DATETIME;
CREATE INDEX IF NOT EXISTS "green_actions_verified_idx" ON "green_actions"("verifiedAt");
