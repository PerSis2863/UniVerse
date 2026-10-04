-- Emails sent per UTC day (src/server/email-budget.ts), so routine emails stop before the
-- Resend plan's daily / monthly allowance runs out and essential ones (sign-in codes) still go.
CREATE TABLE "email_usage" (
  "day" TEXT NOT NULL PRIMARY KEY,
  "sent" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0
);
