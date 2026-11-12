-- M153: Relief emergency texts (the owner, 10 Nov 2026: "please do this"). Helpers can add a phone number
-- to their nearby alert to get a text (SMS) when an organisation declares an emergency around them. Off
-- until the owner turns on "Relief emergency texts" and sets their Twilio account (paid per message).
-- relief_sms_sent keeps one text per person per emergency and the daily cap.
ALTER TABLE "relief_watches" ADD COLUMN "smsTo" TEXT;

CREATE TABLE IF NOT EXISTS "relief_sms_sent" (
  "incidentId" TEXT NOT NULL REFERENCES "relief_incidents"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "ok" BOOLEAN NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("incidentId", "userId")
);
CREATE INDEX IF NOT EXISTS "relief_sms_sent_day_idx" ON "relief_sms_sent"("createdAt");
