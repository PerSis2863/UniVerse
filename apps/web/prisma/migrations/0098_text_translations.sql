-- Stage 5 · B7.5: translations of texts that aren't chat messages (announcements, group posts, and
-- comments on tasks, docs and whiteboards), shared by everyone who reads them: one per text and
-- language. "srcHash" is a hash of the original, so an edited text is translated again.
CREATE TABLE "text_translations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "sourceLang" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "srcHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "text_translations_kind_refId_lang_key" ON "text_translations"("kind", "refId", "lang");
