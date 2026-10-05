-- The welcome tour remembers it was skipped or finished on the account, not just on one device
-- (it kept coming back in the installed app, on other devices, and after storage was cleared).
ALTER TABLE "users" ADD COLUMN "tourDoneAt" DATETIME;
