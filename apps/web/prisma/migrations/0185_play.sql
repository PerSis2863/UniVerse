-- UniVerse Play (M31): every finished round's score, solo or in a room (cloudflare/game-room.ts
-- writes the multiplayer ones). Leaderboards read the best score per person per game.
CREATE TABLE IF NOT EXISTS "game_scores" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "game" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "roomCode" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "game_scores_game_score_idx" ON "game_scores"("game", "score");
CREATE INDEX IF NOT EXISTS "game_scores_user_idx" ON "game_scores"("userId", "createdAt");
