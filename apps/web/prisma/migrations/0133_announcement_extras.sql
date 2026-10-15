-- Stage 5 · B2: a course announcement can wait for a set time (publishAt: students see it and get the
-- notice then; sentAt: when the notice went out), be pinned to the top (pinnedAt), and show its
-- teacher who has seen it (announcement_reads, one row per student who opened the course board).
ALTER TABLE "announcements" ADD COLUMN "publishAt" DATETIME;
ALTER TABLE "announcements" ADD COLUMN "sentAt" DATETIME;
ALTER TABLE "announcements" ADD COLUMN "pinnedAt" DATETIME;

CREATE TABLE "announcement_reads" (
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("announcementId", "userId"),
    CONSTRAINT "announcement_reads_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "announcement_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "announcements_publishAt_sentAt_idx" ON "announcements"("publishAt", "sentAt");
CREATE INDEX "announcement_reads_userId_idx" ON "announcement_reads"("userId");
