-- Stage 5 · B9.10: task board automations ("when a card moves to Done, tell Asha"). trigger moved |
-- created | due-soon; action notify | assign | priority | label | done; listId (null = any list),
-- userId (notify: null = whoever the card is given to) and value (a priority or a label).
-- tasks.dueRemindedAt: a due-soon rule already told about this card.
CREATE TABLE "task_automations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boardId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "listId" TEXT,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "value" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_automations_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "task_boards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "task_automations_boardId_idx" ON "task_automations"("boardId");
CREATE INDEX "task_automations_trigger_idx" ON "task_automations"("trigger");
ALTER TABLE "tasks" ADD COLUMN "dueRemindedAt" DATETIME;
