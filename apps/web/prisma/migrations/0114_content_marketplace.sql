-- Migration 0114: Content Marketplace (Stage 5 · C7)
-- Enables teachers and faculty to publish courses & lesson packs (free or paid)
-- with ratings, reviews, revenue sharing, and one-click import into course modules.

CREATE TABLE IF NOT EXISTS "marketplace_packs" (
  "id" TEXT PRIMARY KEY,
  "authorId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "sourceCourseId" TEXT REFERENCES "courses"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "summary" TEXT NOT NULL,
  "description" TEXT,
  "thumbnailUrl" TEXT,
  "category" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'ALL_LEVELS',
  "priceMinor" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "modulesData" TEXT NOT NULL,
  "modulesCount" INTEGER NOT NULL DEFAULT 0,
  "itemsCount" INTEGER NOT NULL DEFAULT 0,
  "estimatedHours" REAL NOT NULL DEFAULT 5.0,
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "ratingAvg" REAL NOT NULL DEFAULT 0.0,
  "reviewsCount" INTEGER NOT NULL DEFAULT 0,
  "downloadsCount" INTEGER NOT NULL DEFAULT 0,
  "revenueSharePct" INTEGER NOT NULL DEFAULT 80,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "marketplace_packs_category_idx" ON "marketplace_packs"("category");
CREATE INDEX IF NOT EXISTS "marketplace_packs_authorId_idx" ON "marketplace_packs"("authorId");
CREATE INDEX IF NOT EXISTS "marketplace_packs_ratingAvg_idx" ON "marketplace_packs"("ratingAvg");
CREATE INDEX IF NOT EXISTS "marketplace_packs_priceMinor_idx" ON "marketplace_packs"("priceMinor");

CREATE TABLE IF NOT EXISTS "marketplace_reviews" (
  "id" TEXT PRIMARY KEY,
  "packId" TEXT NOT NULL REFERENCES "marketplace_packs"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_reviews_packId_userId_key" ON "marketplace_reviews"("packId", "userId");
CREATE INDEX IF NOT EXISTS "marketplace_reviews_packId_idx" ON "marketplace_reviews"("packId");

CREATE TABLE IF NOT EXISTS "marketplace_imports" (
  "id" TEXT PRIMARY KEY,
  "packId" TEXT NOT NULL REFERENCES "marketplace_packs"("id") ON DELETE CASCADE,
  "targetCourseId" TEXT NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "paymentOrderId" TEXT REFERENCES "payment_orders"("id") ON DELETE SET NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "marketplace_imports_packId_idx" ON "marketplace_imports"("packId");
CREATE INDEX IF NOT EXISTS "marketplace_imports_targetCourseId_idx" ON "marketplace_imports"("targetCourseId");
CREATE INDEX IF NOT EXISTS "marketplace_imports_userId_idx" ON "marketplace_imports"("userId");
