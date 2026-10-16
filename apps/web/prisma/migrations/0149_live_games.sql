-- Live quiz game (Stage 5 · B4.5): the teacher runs a quiz on the class screen, students answer on
-- their phones; points for right answers (more when quicker) and streaks; saved as practice after.
CREATE TABLE "live_games" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LOBBY',
    "questionIds" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT -1,
    "seconds" INTEGER NOT NULL DEFAULT 20,
    "questionAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "live_games_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "live_games_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "live_games_courseId_status_idx" ON "live_games"("courseId", "status");

CREATE TABLE "live_game_players" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "live_game_players_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "live_games" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "live_game_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "live_game_players_gameId_userId_key" ON "live_game_players"("gameId", "userId");

CREATE TABLE "live_game_answers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "ms" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "live_game_answers_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "live_games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "live_game_answers_gameId_userId_questionId_key" ON "live_game_answers"("gameId", "userId", "questionId");
