-- M258: the trip's group chat in Messages (a conversation of everyone planning it), made the first time someone opens
-- it; null until then.
ALTER TABLE "travel_trips" ADD COLUMN "chatId" TEXT;
