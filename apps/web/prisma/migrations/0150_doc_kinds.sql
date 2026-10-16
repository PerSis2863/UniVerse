-- Office suite: spreadsheets and presentations are documents of another kind, sharing their
-- people, comments, history and live editing. A version keeps their own data to restore from.
ALTER TABLE "docs" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'doc';
ALTER TABLE "doc_versions" ADD COLUMN "data" TEXT;
