-- Stage 4 · 1.9: saved replies and message templates, kept per person (JSON).
ALTER TABLE "users" ADD COLUMN "chatSnippets" TEXT;
