-- Stage 4 · 4.5: "Ask your semester". Passages from class transcripts and study packs, course
-- materials, documents, a student's graded work and meeting notes, each with a scope (course:<id>,
-- doc:<id>, user:<id>) that decides who may search it. memory_fts is the full-text index (FTS5,
-- kept in step by the triggers); memory_sources says what was indexed, at which version.
-- Note: D1's "export" command doesn't support virtual tables; Time Travel restores are unaffected.
CREATE TABLE "memory_passages" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "kind" TEXT NOT NULL,
  "ref" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "link" TEXT NOT NULL,
  "at" INTEGER,
  "day" TEXT
);
CREATE INDEX "memory_passages_kind_ref_idx" ON "memory_passages"("kind", "ref");
CREATE INDEX "memory_passages_scope_idx" ON "memory_passages"("scope");
CREATE VIRTUAL TABLE "memory_fts" USING fts5(title, body, content = 'memory_passages', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2');
CREATE TRIGGER "memory_passages_ai" AFTER INSERT ON "memory_passages" BEGIN
  INSERT INTO "memory_fts"(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
CREATE TRIGGER "memory_passages_ad" AFTER DELETE ON "memory_passages" BEGIN
  INSERT INTO "memory_fts"("memory_fts", rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;
CREATE TABLE "memory_sources" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "ref" TEXT NOT NULL,
  "stamp" TEXT NOT NULL,
  "indexedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "memory_sources_kind_ref_key" ON "memory_sources"("kind", "ref");
