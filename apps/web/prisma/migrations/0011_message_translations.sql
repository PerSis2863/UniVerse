-- AlterTable
ALTER TABLE "conversation_participants" ADD COLUMN "translateTo" TEXT;

-- CreateTable
CREATE TABLE "message_translations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "sourceLang" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_translations_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "message_translations_messageId_lang_key" ON "message_translations"("messageId", "lang");

