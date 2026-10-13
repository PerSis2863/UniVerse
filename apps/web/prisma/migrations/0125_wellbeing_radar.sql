-- Stage 5 · D13: wellbeing radar (opt-in, privacy-first). A student's choice to use it (and,
-- separately, to let a counsellor know when their check-ins show a really hard stretch), their own
-- daily check-ins (mood 1–5, tags, a private note), and the requests that reach the school's
-- counsellors: asked for by the student, or sent on a pattern only with their consent. Teachers never
-- see any of it.
CREATE TABLE "wellbeing_settings" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "optedIn" BOOLEAN NOT NULL DEFAULT false,
    "counsellorOk" BOOLEAN NOT NULL DEFAULT false,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "lastNudgeAt" DATETIME,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wellbeing_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "wellbeing_checkins" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "mood" INTEGER NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wellbeing_checkins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "wellbeing_checkins_userId_day_key" ON "wellbeing_checkins"("userId", "day");

CREATE TABLE "wellbeing_alerts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "handledById" TEXT,
    "handledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wellbeing_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "wellbeing_alerts_status_createdAt_idx" ON "wellbeing_alerts"("status", "createdAt");
CREATE INDEX "wellbeing_alerts_userId_idx" ON "wellbeing_alerts"("userId");
