-- M44: the landing's live totals, counted once a day by the daily jobs (src/server/site-totals.ts),
-- already rounded down: people, kg of CO₂ saved, people helped, games played, products checked.
CREATE TABLE IF NOT EXISTS "site_totals" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "value" REAL NOT NULL,
  "day" TEXT NOT NULL
);
