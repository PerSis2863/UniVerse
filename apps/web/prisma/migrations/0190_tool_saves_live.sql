-- Saved work, live (M76): an edit link (editToken) lets signed-in people edit one save together;
-- `version` goes up with every change (a change is only written on top of the version it read, so
-- two people's edits never wipe each other); `editors` lists who has it open ([{id,name,at}], 30 at
-- most). The view link (shareToken) now opens without signing in, read-only.
ALTER TABLE "tool_saves" ADD COLUMN "editToken" TEXT;
ALTER TABLE "tool_saves" ADD COLUMN "editors" TEXT;
ALTER TABLE "tool_saves" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS "tool_saves_editToken_key" ON "tool_saves"("editToken");
