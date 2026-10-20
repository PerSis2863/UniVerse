-- Stage 5 · Q22 (B15.2 leftover): late fees. A fee plan can add a flat late fee to a bill still
-- unpaid some days after it was due. The fee is added to the bill's amount (so payments, receipts
-- and reports stay right) and kept apart in "lateFee" to show it and to waive it.
ALTER TABLE "fee_plans" ADD COLUMN "lateFee" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "fee_plans" ADD COLUMN "lateGraceDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "fee_invoices" ADD COLUMN "lateFee" INTEGER NOT NULL DEFAULT 0;
