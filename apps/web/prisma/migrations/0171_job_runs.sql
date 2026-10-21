-- Stage 5 · bug review: the daily jobs in steps. D1 answers at most 50 queries in one run on
-- Workers Free, and the daily jobs need far more for a real school, so each run does what fits and
-- the 15-minute timer carries on from here until today's list is done (src/server/daily-jobs.ts).
CREATE TABLE "job_runs" (
    "job" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "cursor" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
