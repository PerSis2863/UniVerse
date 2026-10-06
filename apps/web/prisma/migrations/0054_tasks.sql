-- Stage 4 · 3.3: task boards (Kanban lists, cards, comments).
CREATE TABLE "task_boards" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "courseId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "task_boards_ownerId_idx" ON "task_boards"("ownerId");
CREATE INDEX "task_boards_courseId_idx" ON "task_boards"("courseId");
CREATE TABLE "task_board_members" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "boardId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'EDITOR',
  "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_board_members_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "task_boards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "task_board_members_boardId_userId_key" ON "task_board_members"("boardId", "userId");
CREATE INDEX "task_board_members_userId_idx" ON "task_board_members"("userId");
CREATE TABLE "task_lists" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "boardId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "position" REAL NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_lists_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "task_boards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "task_lists_boardId_idx" ON "task_lists"("boardId");
CREATE TABLE "tasks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "boardId" TEXT NOT NULL,
  "listId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "assigneeId" TEXT,
  "dueAt" DATETIME,
  "position" REAL NOT NULL DEFAULT 0,
  "checklist" TEXT,
  "doneAt" DATETIME,
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "tasks_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "task_boards" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tasks_listId_fkey" FOREIGN KEY ("listId") REFERENCES "task_lists" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "tasks_boardId_idx" ON "tasks"("boardId");
CREATE INDEX "tasks_assigneeId_doneAt_idx" ON "tasks"("assigneeId", "doneAt");
CREATE TABLE "task_comments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "task_comments_taskId_idx" ON "task_comments"("taskId");
