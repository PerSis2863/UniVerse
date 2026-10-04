-- Shared code editors for a course (src/server/code-rooms.ts). The code itself lives in the
-- room's Durable Object (cloudflare/worker.ts CodeRoom); this is the list and who may edit.
CREATE TABLE "code_rooms" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL,
  "createdById" TEXT,
  "title" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'javascript',
  "locked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "code_rooms_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "code_rooms_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "code_rooms_courseId_idx" ON "code_rooms"("courseId");
CREATE INDEX "code_rooms_createdById_idx" ON "code_rooms"("createdById");
