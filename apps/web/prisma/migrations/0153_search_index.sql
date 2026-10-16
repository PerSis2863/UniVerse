-- Stage 5 · Q10: search everywhere. One row per document, task card and assignment, with the scope
-- that decides who may find it (doc:<id>, tboard:<board id>, course:<id>), written by the app in the
-- same request as the change (src/server/search-index.ts). search_fts is the full-text index (FTS5,
-- kept in step by the triggers below). Removing a document, card or assignment removes its row.
-- Note: D1's "export" command doesn't support virtual tables; Time Travel restores are unaffected.
CREATE TABLE "search_items" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "kind" TEXT NOT NULL,
  "ref" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "sub" TEXT,
  "link" TEXT NOT NULL,
  "at" INTEGER
);
CREATE UNIQUE INDEX "search_items_kind_ref_key" ON "search_items"("kind", "ref");
CREATE INDEX "search_items_scope_idx" ON "search_items"("scope");
CREATE VIRTUAL TABLE "search_fts" USING fts5(title, body, content = 'search_items', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3');
CREATE TRIGGER "search_items_ai" AFTER INSERT ON "search_items" BEGIN
  INSERT INTO "search_fts"(rowid, title, body) VALUES (new."id", new."title", new."body");
END;
CREATE TRIGGER "search_items_ad" AFTER DELETE ON "search_items" BEGIN
  INSERT INTO "search_fts"("search_fts", rowid, title, body) VALUES ('delete', old."id", old."title", old."body");
END;
CREATE TRIGGER "search_items_au" AFTER UPDATE ON "search_items" BEGIN
  INSERT INTO "search_fts"("search_fts", rowid, title, body) VALUES ('delete', old."id", old."title", old."body");
  INSERT INTO "search_fts"(rowid, title, body) VALUES (new."id", new."title", new."body");
END;
CREATE TRIGGER "search_docs_ad" AFTER DELETE ON "docs" BEGIN
  DELETE FROM "search_items" WHERE "kind" = 'doc' AND "ref" = old."id";
END;
CREATE TRIGGER "search_tasks_ad" AFTER DELETE ON "tasks" BEGIN
  DELETE FROM "search_items" WHERE "kind" = 'task' AND "ref" = old."id";
END;
CREATE TRIGGER "search_assignments_ad" AFTER DELETE ON "assignments" BEGIN
  DELETE FROM "search_items" WHERE "kind" = 'assignment' AND "ref" = old."id";
END;
-- What's there already: documents by their preview (the first words; their whole text from their
-- next save), cards and assignments in full.
INSERT INTO "search_items" ("kind", "ref", "scope", "title", "body", "sub", "link", "at")
  SELECT 'doc', "id", 'doc:' || "id", "title", COALESCE("preview", ''), "kind",
    CASE "kind" WHEN 'sheet' THEN '/sheets/' WHEN 'slides' THEN '/slides/' ELSE '/docs/' END || "id", NULL FROM "docs";
INSERT INTO "search_items" ("kind", "ref", "scope", "title", "body", "sub", "link", "at")
  SELECT 'task', t."id", 'tboard:' || t."boardId", t."title", COALESCE(t."notes", ''), b."title", '/tasks/' || t."boardId" || '?task=' || t."id", NULL
  FROM "tasks" t JOIN "task_boards" b ON b."id" = t."boardId";
INSERT INTO "search_items" ("kind", "ref", "scope", "title", "body", "sub", "link", "at")
  SELECT 'assignment', a."id", 'course:' || a."courseId", a."title", a."instructions", c."code", 'assignment:' || a."id", NULL
  FROM "assignments" a JOIN "courses" c ON c."id" = a."courseId";
