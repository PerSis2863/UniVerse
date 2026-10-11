-- Stage 5 · B9.2: a wiki of pages. docs.parentId: the page this one sits under (its sub-pages
-- share its people: whoever can open the parent can open them). When a page is deleted its
-- sub-pages move to the top. doc_links: which pages link to which (from the saved versions), for
-- "Linked from" (backlinks).
ALTER TABLE "docs" ADD COLUMN "parentId" TEXT REFERENCES "docs" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "docs_parentId_idx" ON "docs"("parentId");
CREATE TABLE "doc_links" (
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    PRIMARY KEY ("fromId", "toId"),
    CONSTRAINT "doc_links_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "docs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "doc_links_toId_fkey" FOREIGN KEY ("toId") REFERENCES "docs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "doc_links_toId_idx" ON "doc_links"("toId");
