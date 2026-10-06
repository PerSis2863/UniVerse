-- Stage 4 · 3.2: documents (live text lives in the CodeRoom Durable Object; versions and comments here).
CREATE TABLE "docs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "courseId" TEXT,
  "preview" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "docs_ownerId_idx" ON "docs"("ownerId");
CREATE INDEX "docs_courseId_idx" ON "docs"("courseId");
CREATE TABLE "doc_members" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "docId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'EDITOR',
  "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "doc_members_docId_fkey" FOREIGN KEY ("docId") REFERENCES "docs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "doc_members_docId_userId_key" ON "doc_members"("docId", "userId");
CREATE INDEX "doc_members_userId_idx" ON "doc_members"("userId");
CREATE TABLE "doc_versions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "docId" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "name" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "doc_versions_docId_fkey" FOREIGN KEY ("docId") REFERENCES "docs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "doc_versions_docId_createdAt_idx" ON "doc_versions"("docId", "createdAt");
CREATE TABLE "doc_comments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "docId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "quote" TEXT,
  "body" TEXT NOT NULL,
  "resolvedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "doc_comments_docId_fkey" FOREIGN KEY ("docId") REFERENCES "docs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "doc_comments_docId_idx" ON "doc_comments"("docId");
