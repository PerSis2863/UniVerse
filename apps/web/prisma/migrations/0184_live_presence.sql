-- M28 (500 people a month on the $5 plan): when a person has UniVerse open with live updates. Their
-- live hub (cloudflare/worker.ts RealtimeHub) sets it when a tab connects and clears it when the last
-- one closes, so live events skip people who aren't there (each event to a hub is a billed request).
ALTER TABLE "users" ADD COLUMN "liveAt" DATETIME;
