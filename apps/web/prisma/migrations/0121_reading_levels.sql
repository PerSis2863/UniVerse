-- Stage 5 · D9: reading-level adapter. A text (a section of a course material, or assignment
-- instructions) rewritten by AI for a reading level ("g8", "g5"), in its own
-- language ("") or translated ("fr"), with key terms explained. Made once and shared by everyone;
-- an edited text is rewritten again (srcHash).
CREATE TABLE "leveled_texts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "terms" TEXT NOT NULL DEFAULT '[]',
    "srcHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "leveled_texts_kind_refId_level_lang_key" ON "leveled_texts"("kind", "refId", "level", "lang");
