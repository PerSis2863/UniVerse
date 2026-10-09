-- Stage 5 · B15.2: school fees. An admin makes a fee plan (for one class or every student: the
-- items, the currency and how many instalments with their due dates) and issues it: one bill per
-- student per instalment. Bills can get a discount (sibling, scholarship…) or be waived; payments
-- are recorded at the office (cash, bank transfer, cheque, UPI, card), each with a numbered
-- receipt, and a wrong one is voided with a reason, never deleted. Overdue bills can be reminded
-- in the app. Amounts are whole minor units (paise, cents), so sums never round.
CREATE TABLE "fee_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "courseId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "items" TEXT NOT NULL,
    "instalments" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fee_plans_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fee_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "fee_plans_createdAt_idx" ON "fee_plans"("createdAt");

CREATE TABLE "fee_invoices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seq" INTEGER NOT NULL,
    "planId" TEXT,
    "instalment" INTEGER NOT NULL DEFAULT 1,
    "studentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "amount" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "discountNote" TEXT,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "dueAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "remindedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fee_invoices_planId_fkey" FOREIGN KEY ("planId") REFERENCES "fee_plans" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fee_invoices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "fee_invoices_seq_key" ON "fee_invoices"("seq");
CREATE UNIQUE INDEX "fee_invoices_planId_instalment_studentId_key" ON "fee_invoices"("planId", "instalment", "studentId");
CREATE INDEX "fee_invoices_studentId_idx" ON "fee_invoices"("studentId");
CREATE INDEX "fee_invoices_status_dueAt_idx" ON "fee_invoices"("status", "dueAt");

CREATE TABLE "fee_payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seq" INTEGER NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "paidAt" DATETIME NOT NULL,
    "receivedById" TEXT NOT NULL,
    "voidedAt" DATETIME,
    "voidReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fee_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fee_payments_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "fee_payments_seq_key" ON "fee_payments"("seq");
CREATE INDEX "fee_payments_invoiceId_idx" ON "fee_payments"("invoiceId");
CREATE INDEX "fee_payments_paidAt_idx" ON "fee_payments"("paidAt");
