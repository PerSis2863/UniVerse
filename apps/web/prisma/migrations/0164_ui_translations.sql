-- Stage 5 · Q21 Languages: the app's screens in other languages, drafted by the AI translator from
-- public/i18n/catalog.json (Owner console → Languages). Each language is split in 32 parts (by a
-- hash of the English text, src/lib/ui-dictionary.ts) so no row is large; `data` is JSON
-- { s: { english: translation }, r: [english texts a person has checked] }.
CREATE TABLE "ui_translations" (
    "lang" TEXT NOT NULL,
    "chunk" INTEGER NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{"s":{},"r":[]}',
    "count" INTEGER NOT NULL DEFAULT 0,
    "reviewed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("lang", "chunk")
);
