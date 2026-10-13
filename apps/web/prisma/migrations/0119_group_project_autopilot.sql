-- Migration 0119: Group Project Autopilot (Stage 5 · D6)
-- AI project autopilot for group assignments: brief splitting into TaskBoard tasks,
-- skill-based member assignee matching, mutual timetable slot resolver,
-- group call scheduler, and weekly fair-contribution progress reports for teachers.

CREATE TABLE IF NOT EXISTS "group_autopilot_plans" (
  "id" TEXT PRIMARY KEY,
  "groupId" TEXT NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "courseId" TEXT REFERENCES "courses"("id") ON DELETE SET NULL,
  "assignmentId" TEXT REFERENCES "assignments"("id") ON DELETE SET NULL,
  "boardId" TEXT REFERENCES "task_boards"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "brief" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "targetDueDate" DATETIME,
  "meetingCadence" TEXT NOT NULL DEFAULT 'WEEKLY',
  "meetingSlot" TEXT,
  "scheduledCallId" TEXT REFERENCES "scheduled_calls"("id") ON DELETE SET NULL,
  "breakdownJson" TEXT NOT NULL DEFAULT '[]',
  "createdById" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "group_autopilot_plans_group_idx" ON "group_autopilot_plans"("groupId");
CREATE INDEX IF NOT EXISTS "group_autopilot_plans_course_idx" ON "group_autopilot_plans"("courseId");
CREATE INDEX IF NOT EXISTS "group_autopilot_plans_assignment_idx" ON "group_autopilot_plans"("assignmentId");
CREATE INDEX IF NOT EXISTS "group_autopilot_plans_status_idx" ON "group_autopilot_plans"("status");
CREATE INDEX IF NOT EXISTS "group_autopilot_plans_created_by_idx" ON "group_autopilot_plans"("createdById");

CREATE TABLE IF NOT EXISTS "group_autopilot_reports" (
  "id" TEXT PRIMARY KEY,
  "planId" TEXT NOT NULL REFERENCES "group_autopilot_plans"("id") ON DELETE CASCADE,
  "groupId" TEXT NOT NULL,
  "weekNumber" INTEGER NOT NULL DEFAULT 1,
  "summary" TEXT NOT NULL,
  "health" TEXT NOT NULL DEFAULT 'ON_TRACK',
  "fairContributionScore" REAL NOT NULL DEFAULT 1.0,
  "metricsJson" TEXT NOT NULL DEFAULT '{}',
  "nudgesJson" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "group_autopilot_reports_plan_idx" ON "group_autopilot_reports"("planId");
CREATE INDEX IF NOT EXISTS "group_autopilot_reports_group_idx" ON "group_autopilot_reports"("groupId");
CREATE INDEX IF NOT EXISTS "group_autopilot_reports_health_idx" ON "group_autopilot_reports"("health");
CREATE INDEX IF NOT EXISTS "group_autopilot_reports_created_idx" ON "group_autopilot_reports"("createdAt");
