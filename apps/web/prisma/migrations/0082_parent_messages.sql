-- Stage 5 · B16.2: parent–teacher messages. A parent–teacher chat is an ordinary one-to-one chat
-- (the teacher sees it in their inbox) marked with the child it's about. Teachers set the hours they
-- answer parents; outside them, messages still arrive but don't buzz their phone. The school can
-- switch parent messages off.
ALTER TABLE "conversations" ADD COLUMN "aboutStudentId" TEXT;
CREATE INDEX "conversations_aboutStudentId_idx" ON "conversations"("aboutStudentId");

ALTER TABLE "school_policy" ADD COLUMN "parentMessaging" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "parent_contact_hours" (
    "teacherId" TEXT NOT NULL PRIMARY KEY,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "days" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "start" TEXT NOT NULL DEFAULT '08:00',
    "end" TEXT NOT NULL DEFAULT '16:00',
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parent_contact_hours_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
