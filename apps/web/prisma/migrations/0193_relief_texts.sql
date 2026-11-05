-- M107: text requests for Relief organisations (the owner's seven ideas: "SMS/WhatsApp requests behind
-- a switch"). People without the app text an organisation's number (a Twilio number, SMS or WhatsApp);
-- the message lands in that organisation's inbox, which only its coordinators see (it holds the
-- sender's phone number), and a coordinator puts it on the map as a need. Off until the owner turns on
-- "Relief text requests" and sets TWILIO_AUTH_TOKEN.

ALTER TABLE "relief_orgs" ADD COLUMN "textNumber" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "relief_orgs_text_number_key" ON "relief_orgs"("textNumber");

CREATE TABLE IF NOT EXISTS "relief_texts" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL REFERENCES "relief_orgs"("id") ON DELETE CASCADE,
  "channel" TEXT NOT NULL DEFAULT 'SMS',
  "fromNumber" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "postId" TEXT REFERENCES "relief_posts"("id") ON DELETE SET NULL,
  "handledById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "handledAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "relief_texts_org_idx" ON "relief_texts"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "relief_texts_from_idx" ON "relief_texts"("fromNumber", "createdAt");
