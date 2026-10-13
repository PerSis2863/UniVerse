-- Stage 5 · D14: Impact League, seasonal challenges between universities around a UN goal (SDG).
-- Organizers (admins, and staff they add) run a challenge; mentors, judges and sponsors are people
-- they add. Students form teams across the campus network: each team gets a private group and a
-- task board with the challenge's milestones. Demo day is a call (id lg_<challenge>, webinar mode);
-- judges score submitted projects on a rubric, sponsors' prizes go to teams, every finisher gets a
-- signed credential, and the public showcase page shows teams, universities and projects (never names).
CREATE TABLE "league_challenges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sdg" INTEGER,
    "summary" TEXT NOT NULL DEFAULT '',
    "brief" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "teamMin" INTEGER NOT NULL DEFAULT 2,
    "teamMax" INTEGER NOT NULL DEFAULT 5,
    "mixCampuses" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "creditHours" INTEGER NOT NULL DEFAULT 20,
    "signupClosesAt" DATETIME,
    "demoDayAt" DATETIME,
    "milestones" TEXT NOT NULL DEFAULT '[]',
    "rubric" TEXT NOT NULL DEFAULT '[]',
    "prizes" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "league_challenges_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "league_challenges_slug_key" ON "league_challenges"("slug");
CREATE INDEX "league_challenges_status_idx" ON "league_challenges"("status");

CREATE TABLE "league_people" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "league_people_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "league_challenges" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "league_people_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "league_people_challengeId_userId_role_key" ON "league_people"("challengeId", "userId", "role");
CREATE INDEX "league_people_userId_idx" ON "league_people"("userId");

CREATE TABLE "league_teams" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challengeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lookingFor" TEXT NOT NULL DEFAULT '',
    "groupId" TEXT,
    "boardId" TEXT,
    "mentorId" TEXT,
    "projectTitle" TEXT NOT NULL DEFAULT '',
    "pitch" TEXT NOT NULL DEFAULT '',
    "link" TEXT NOT NULL DEFAULT '',
    "showcase" BOOLEAN NOT NULL DEFAULT true,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'FORMING',
    "submittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "league_teams_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "league_challenges" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "league_teams_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "league_teams_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "league_teams_challengeId_name_key" ON "league_teams"("challengeId", "name");
CREATE INDEX "league_teams_mentorId_idx" ON "league_teams"("mentorId");

CREATE TABLE "league_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challengeId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "captain" BOOLEAN NOT NULL DEFAULT false,
    "certificateId" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "league_members_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "league_challenges" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "league_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "league_teams" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "league_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "league_members_challengeId_userId_key" ON "league_members"("challengeId", "userId");
CREATE INDEX "league_members_teamId_idx" ON "league_members"("teamId");
CREATE INDEX "league_members_userId_idx" ON "league_members"("userId");

CREATE TABLE "league_scores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "judgeId" TEXT NOT NULL,
    "scores" TEXT NOT NULL DEFAULT '[]',
    "total" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "league_scores_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "league_teams" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "league_scores_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "league_scores_teamId_judgeId_key" ON "league_scores"("teamId", "judgeId");
CREATE INDEX "league_scores_judgeId_idx" ON "league_scores"("judgeId");
