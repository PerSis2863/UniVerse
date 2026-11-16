-- M197: when the "due soon" reminder went out for an assignment (students who haven't handed it in,
-- and its teacher with who they are), so it goes once.
ALTER TABLE "assignments" ADD COLUMN "nudgedAt" DATETIME;
CREATE INDEX "assignments_status_dueDate_idx" ON "assignments"("status", "dueDate");
