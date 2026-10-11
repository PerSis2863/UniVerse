-- Stage 5 · B9.9: task card extras: priority (LOW | MEDIUM | HIGH | URGENT), labels (JSON string[]),
-- an estimate in hours, repeating (daily | weekdays | weekly | monthly: marking it done makes the
-- next one), "blocked by" (JSON ids of cards on the same board), and a work-in-progress limit per list.
ALTER TABLE "tasks" ADD COLUMN "priority" TEXT;
ALTER TABLE "tasks" ADD COLUMN "labels" TEXT;
ALTER TABLE "tasks" ADD COLUMN "estimate" REAL;
ALTER TABLE "tasks" ADD COLUMN "repeat" TEXT;
ALTER TABLE "tasks" ADD COLUMN "blockedBy" TEXT;
ALTER TABLE "task_lists" ADD COLUMN "wipLimit" INTEGER;
