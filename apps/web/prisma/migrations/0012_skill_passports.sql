-- CreateTable
CREATE TABLE "skill_passports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "headline" TEXT,
    "showSkills" BOOLEAN NOT NULL DEFAULT true,
    "showCredentials" BOOLEAN NOT NULL DEFAULT true,
    "showCourses" BOOLEAN NOT NULL DEFAULT false,
    "showImpact" BOOLEAN NOT NULL DEFAULT true,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "skill_passports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "skill_passports_userId_key" ON "skill_passports"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "skill_passports_slug_key" ON "skill_passports"("slug");

