-- Stage 5 · Q19 Owner console: each change of a school's subscription (from Stripe, src/lib/billing.ts
-- syncSubscription), so the owner sees new and cancelled schools per month (churn).
CREATE TABLE "subscription_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "fromPlan" TEXT,
    "toPlan" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "subscription_events_createdAt_idx" ON "subscription_events"("createdAt");
CREATE INDEX "subscription_events_organizationId_idx" ON "subscription_events"("organizationId");
