-- Stage 5 · A9, the owner console's Health numbers: a sample of API requests (1 in 20, and every
-- server error) with how long they took, kept 7 days; and small daily counters (push notifications
-- delivered, failed, expired).
CREATE TABLE "api_timings" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "route" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "status" INTEGER NOT NULL,
  "ms" INTEGER NOT NULL,
  "weight" INTEGER NOT NULL,
  "at" INTEGER NOT NULL
);
CREATE INDEX "api_timings_at_idx" ON "api_timings"("at");
CREATE TABLE "health_counts" (
  "day" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "n" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("day", "key")
);
