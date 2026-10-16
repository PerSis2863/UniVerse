-- Stage 5 · Q8: each person's home page cards (order, hidden ones, daily study goal), JSON
-- (src/lib/home-layout.ts cleanLayout).
ALTER TABLE "users" ADD COLUMN "homeLayout" TEXT;
