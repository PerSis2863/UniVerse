-- Stage 5 · B3.2: group assignments. groupMode: null (each student hands in), SHARED (one hand-in per
-- group, one grade for everyone in it) or INDIVIDUAL (one hand-in per group, a grade for each member).
ALTER TABLE "assignments" ADD COLUMN "groupMode" TEXT;

CREATE TABLE "assignment_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assignment_groups_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "assignment_groups_assignmentId_name_key" ON "assignment_groups"("assignmentId", "name");

-- A student is in at most one group per assignment.
CREATE TABLE "assignment_group_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    CONSTRAINT "assignment_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "assignment_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assignment_group_members_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "assignment_group_members_assignmentId_studentId_key" ON "assignment_group_members"("assignmentId", "studentId");
CREATE INDEX "assignment_group_members_groupId_idx" ON "assignment_group_members"("groupId");
CREATE INDEX "assignment_group_members_studentId_idx" ON "assignment_group_members"("studentId");

-- A group's hand-in (studentId: who handed it in first) and the grade row of each member
-- ({ studentId: { gradeId, score } }, JSON).
ALTER TABLE "assignment_submissions" ADD COLUMN "groupId" TEXT REFERENCES "assignment_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assignment_submissions" ADD COLUMN "memberGrades" TEXT;
CREATE INDEX "assignment_submissions_groupId_idx" ON "assignment_submissions"("groupId");
