-- Migration 0113: Unified Payments Provider (Stage 5 · C6)
-- Supports Razorpay with UPI/QR/Netbanking for India and Stripe for International payments.
-- Enables online fee payments, event tickets, donations, automated receipts, refunds and reconciliation.

-- 1. Institutional payment configuration
ALTER TABLE "organizations" ADD COLUMN "paymentProvider" TEXT NOT NULL DEFAULT 'AUTO';
ALTER TABLE "organizations" ADD COLUMN "razorpayKeyId" TEXT;
ALTER TABLE "organizations" ADD COLUMN "razorpayKeySecret" TEXT;
ALTER TABLE "organizations" ADD COLUMN "razorpayWebhookSecret" TEXT;
ALTER TABLE "organizations" ADD COLUMN "stripePublishableKey" TEXT;
ALTER TABLE "organizations" ADD COLUMN "stripeSecretKey" TEXT;
ALTER TABLE "organizations" ADD COLUMN "stripeWebhookSecret" TEXT;

-- 2. Enhanced fee payment gateway tracking & refunds
ALTER TABLE "fee_payments" ADD COLUMN "gateway" TEXT;
ALTER TABLE "fee_payments" ADD COLUMN "orderId" TEXT;
ALTER TABLE "fee_payments" ADD COLUMN "refundedAt" DATETIME;
ALTER TABLE "fee_payments" ADD COLUMN "refundedAmount" INTEGER;
ALTER TABLE "fee_payments" ADD COLUMN "refundReason" TEXT;

-- 3. Unified online payment order tracking
CREATE TABLE IF NOT EXISTS "payment_orders" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT REFERENCES "organizations"("id") ON DELETE CASCADE,
  "userId" TEXT REFERENCES "users"("id") ON DELETE CASCADE,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "provider" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'FEE',
  "invoiceId" TEXT REFERENCES "fee_invoices"("id") ON DELETE SET NULL,
  "orderRef" TEXT NOT NULL,
  "paymentRef" TEXT,
  "signature" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "customerName" TEXT,
  "customerEmail" TEXT,
  "customerPhone" TEXT,
  "metadata" TEXT,
  "paidAt" DATETIME,
  "refundedAt" DATETIME,
  "refundAmount" INTEGER,
  "refundReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "payment_orders_organizationId_idx" ON "payment_orders"("organizationId");
CREATE INDEX IF NOT EXISTS "payment_orders_userId_idx" ON "payment_orders"("userId");
CREATE INDEX IF NOT EXISTS "payment_orders_invoiceId_idx" ON "payment_orders"("invoiceId");
CREATE INDEX IF NOT EXISTS "payment_orders_orderRef_idx" ON "payment_orders"("orderRef");
CREATE INDEX IF NOT EXISTS "payment_orders_status_idx" ON "payment_orders"("status");
