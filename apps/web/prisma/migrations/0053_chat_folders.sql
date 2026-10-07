-- Stage 4 · 1.6: chat folders, kept per person (JSON).
ALTER TABLE "users" ADD COLUMN "chatFolders" TEXT;
