-- Stage 4 · 3.1: study groups get task boards and documents too (their Space).
ALTER TABLE "task_boards" ADD COLUMN "groupId" TEXT;
CREATE INDEX "task_boards_groupId_idx" ON "task_boards"("groupId");
ALTER TABLE "docs" ADD COLUMN "groupId" TEXT;
CREATE INDEX "docs_groupId_idx" ON "docs"("groupId");
