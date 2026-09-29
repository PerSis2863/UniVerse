-- Profile photos must be image addresses. Some accounts had a letter (e.g. "A") stored instead,
-- which browsers requested as a page on every screen showing that person. Show initials instead.
UPDATE "users" SET "avatar" = NULL
WHERE "avatar" IS NOT NULL
  AND "avatar" NOT LIKE 'https://%'
  AND "avatar" NOT LIKE 'http://%'
  AND "avatar" NOT LIKE '/%'
  AND "avatar" NOT LIKE 'data:image/%';
