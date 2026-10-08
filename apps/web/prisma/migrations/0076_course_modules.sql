-- Stage 5 · B2: course modules. A course's ordered units, each with ordered items (page, file,
-- link, video, quiz, assignment, live class), and which items each student has finished.
CREATE TABLE "course_modules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "position" INTEGER NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "releaseAt" DATETIME,
    "requireQuizId" TEXT,
    "requireScore" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "course_modules_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "module_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "url" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "module_items_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "course_modules" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "item_progress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "doneAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "item_progress_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "module_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "item_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "course_modules_courseId_position_idx" ON "course_modules"("courseId", "position");
CREATE INDEX "module_items_moduleId_position_idx" ON "module_items"("moduleId", "position");
CREATE UNIQUE INDEX "item_progress_itemId_userId_key" ON "item_progress"("itemId", "userId");
CREATE INDEX "item_progress_userId_idx" ON "item_progress"("userId");
