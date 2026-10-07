-- Stage 4 · 1.14 follow-up: a full-text index for message search. One row per searchable message
-- (rowid = the message's rowid): its text (and captions), file name, and voice transcript (from
-- metadata.transcript). Kept in step by triggers, so every way of writing messages is covered.
-- Accents are ignored; 2- and 3-letter prefixes are indexed for search as you type.
-- Not indexed: system lines, calls, deleted messages.
CREATE VIRTUAL TABLE "message_fts" USING fts5(body, file, voice, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3');

CREATE TRIGGER "message_fts_ai" AFTER INSERT ON "messages" WHEN new."type" NOT IN ('SYSTEM', 'CALL') AND new."deletedAt" IS NULL BEGIN
  INSERT INTO "message_fts"(rowid, body, file, voice) VALUES (
    new.rowid,
    CASE WHEN new."type" = 'AUDIO' THEN '' ELSE coalesce(new."body", '') END,
    coalesce(new."attachmentName", ''),
    coalesce(CASE WHEN json_valid(new."metadata") THEN json_extract(new."metadata", '$.transcript') END, '')
  );
END;

CREATE TRIGGER "message_fts_ad" AFTER DELETE ON "messages" BEGIN
  DELETE FROM "message_fts" WHERE rowid = old.rowid;
END;

CREATE TRIGGER "message_fts_au" AFTER UPDATE OF "body", "attachmentName", "metadata", "deletedAt", "type" ON "messages" BEGIN
  DELETE FROM "message_fts" WHERE rowid = old.rowid;
  INSERT INTO "message_fts"(rowid, body, file, voice)
    SELECT new.rowid,
      CASE WHEN new."type" = 'AUDIO' THEN '' ELSE coalesce(new."body", '') END,
      coalesce(new."attachmentName", ''),
      coalesce(CASE WHEN json_valid(new."metadata") THEN json_extract(new."metadata", '$.transcript') END, '')
    WHERE new."type" NOT IN ('SYSTEM', 'CALL') AND new."deletedAt" IS NULL;
END;

-- The messages already there.
INSERT INTO "message_fts"(rowid, body, file, voice)
  SELECT rowid,
    CASE WHEN "type" = 'AUDIO' THEN '' ELSE coalesce("body", '') END,
    coalesce("attachmentName", ''),
    coalesce(CASE WHEN json_valid("metadata") THEN json_extract("metadata", '$.transcript') END, '')
  FROM "messages" WHERE "type" NOT IN ('SYSTEM', 'CALL') AND "deletedAt" IS NULL;
