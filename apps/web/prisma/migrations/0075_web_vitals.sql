-- Stage 5 · A4: how fast pages are for real people (Core Web Vitals), from 10% of page loads.
-- Anonymous: the page (ids replaced by :id), the measure, its value and phone or desktop.
-- Kept 30 days (the daily job prunes it). Shown in the owner console (Analytics → Speed).
CREATE TABLE "web_vitals" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "page" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "device" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "web_vitals_createdAt_idx" ON "web_vitals"("createdAt");
