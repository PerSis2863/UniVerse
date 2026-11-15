-- M194: Create work someone opened from another person's link (view or edit), so it shows on their
-- Collaborate home under "Shared with me" while that very link still works (a new link made after the
-- old one was stopped isn't given to them). One row a person and piece of work.
CREATE TABLE "tool_save_opens" (
    "saveId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'view',
    "token" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("saveId", "userId"),
    CONSTRAINT "tool_save_opens_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "tool_saves" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tool_save_opens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "tool_save_opens_userId_openedAt_idx" ON "tool_save_opens"("userId", "openedAt");
