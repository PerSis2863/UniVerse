-- Stage 5 · B7.2: sticker packs. Anyone can make their own packs (up to 5, 30 stickers each); an
-- admin can make a pack for the whole school. A sticker is an uploaded image; sent, it's a photo
-- message marked as a sticker (shown large, without a bubble).
CREATE TABLE "sticker_packs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "school" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sticker_packs_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "sticker_packs_ownerId_idx" ON "sticker_packs"("ownerId");
CREATE INDEX "sticker_packs_school_idx" ON "sticker_packs"("school");

CREATE TABLE "stickers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stickers_packId_fkey" FOREIGN KEY ("packId") REFERENCES "sticker_packs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "stickers_packId_idx" ON "stickers"("packId");
