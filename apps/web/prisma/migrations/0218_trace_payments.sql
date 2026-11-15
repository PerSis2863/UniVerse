-- M201: Trace brands pay by themselves through the owner's Stripe account (off until the owner's switch):
-- PRO by subscription (the brand's Stripe customer and subscription kept here), and money added to a
-- campaign's budget (each paid Checkout session recorded once, so a resent webhook can't add it twice).
ALTER TABLE "trace_brands" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "trace_brands" ADD COLUMN "stripeSubscriptionId" TEXT;
CREATE TABLE "trace_fundings" (
    "sessionId" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trace_fundings_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "trace_campaigns" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "trace_fundings_campaignId_idx" ON "trace_fundings"("campaignId");
