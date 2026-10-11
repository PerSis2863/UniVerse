-- Stage 5 · B9.13: the files hub across spaces. Personal files are a space of kind 'me' (spaceId =
-- the user), so they get folders and versions like the others. space_files.text: words taken out
-- of the file in the browser when it's uploaded, for searching inside files. Stars per person, and
-- share links (a random token) that stop working after a day, a week or a month.
ALTER TABLE "space_files" ADD COLUMN "text" TEXT;
CREATE INDEX "space_files_spaceKind_spaceId_updatedAt_idx" ON "space_files"("spaceKind", "spaceId", "updatedAt");
CREATE TABLE "space_file_stars" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "space_file_stars_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "space_files" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "space_file_stars_userId_fileId_key" ON "space_file_stars"("userId", "fileId");
CREATE TABLE "space_file_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "opens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "space_file_links_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "space_files" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "space_file_links_token_key" ON "space_file_links"("token");
CREATE INDEX "space_file_links_fileId_idx" ON "space_file_links"("fileId");
