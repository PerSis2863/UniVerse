-- Stage 5 · B2: a discussion board per course. Threads are questions or discussions; replies can
-- be upvoted, accepted as the answer (by whoever asked, or the teacher) and endorsed by the teacher.
-- Classmates can post without their name showing to other students (the teacher always sees it).
CREATE TABLE "course_threads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'QUESTION',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "answerId" TEXT,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "replies" INTEGER NOT NULL DEFAULT 0,
    "editedAt" DATETIME,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "course_threads_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_threads_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "course_posts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "endorsed" BOOLEAN NOT NULL DEFAULT false,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "editedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "course_posts_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "course_threads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- One upvote per person per thread or reply (targetId is either).
CREATE TABLE "course_votes" (
    "userId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId", "targetId"),
    CONSTRAINT "course_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "course_threads_courseId_lastActivityAt_idx" ON "course_threads"("courseId", "lastActivityAt");
CREATE INDEX "course_threads_authorId_idx" ON "course_threads"("authorId");
CREATE INDEX "course_posts_threadId_createdAt_idx" ON "course_posts"("threadId", "createdAt");
CREATE INDEX "course_posts_authorId_idx" ON "course_posts"("authorId");
CREATE INDEX "course_votes_targetId_idx" ON "course_votes"("targetId");
