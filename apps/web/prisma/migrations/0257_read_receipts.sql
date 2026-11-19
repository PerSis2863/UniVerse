-- M344 (WhatsApp's and Signal's read receipts setting): off hides when I've read messages, and (both ways) shows me
-- no one else's.
ALTER TABLE "users" ADD COLUMN "readReceipts" BOOLEAN NOT NULL DEFAULT 1;
