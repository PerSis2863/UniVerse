-- CreateTable
CREATE TABLE "course_sources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "materialId" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "chars" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "course_sources_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "study_cards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "courseId" TEXT,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "sourceTitle" TEXT,
    "due" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "interval" INTEGER NOT NULL DEFAULT 0,
    "ease" REAL NOT NULL DEFAULT 2.5,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "study_cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "course_sources_materialId_key" ON "course_sources"("materialId");

-- CreateIndex
CREATE INDEX "course_sources_courseId_idx" ON "course_sources"("courseId");

-- CreateIndex
CREATE INDEX "study_cards_userId_due_idx" ON "study_cards"("userId", "due");

