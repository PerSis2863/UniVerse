-- Stage 4 · 3.7: a files hub per space (a class or a study group): folders, files and every version
-- of each file. The file itself is an upload (R2 or the database, src/lib/storage.ts).
CREATE TABLE "space_folders" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "spaceKind" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "parentId" TEXT,
  "name" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "space_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "space_folders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "space_folders_space_idx" ON "space_folders"("spaceKind", "spaceId");
CREATE TABLE "space_files" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "spaceKind" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "folderId" TEXT,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "space_files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "space_folders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "space_files_space_idx" ON "space_files"("spaceKind", "spaceId", "folderId");
CREATE TABLE "space_file_versions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fileId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "note" TEXT,
  "uploadedById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "space_file_versions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "space_files" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "space_file_versions_fileId_idx" ON "space_file_versions"("fileId", "createdAt");
