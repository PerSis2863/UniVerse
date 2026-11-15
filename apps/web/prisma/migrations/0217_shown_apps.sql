-- M186: which apps the website shows (the owner, 15 Nov 2026: "when i want to show only one app then it
-- should switch to that one app and website then no other apps should be there just that one and it
-- should be synced properly"). A JSON list of app ids (src/lib/apps.ts), set in the owner console →
-- Server → Apps on the website; NULL shows every app.

ALTER TABLE "server_control" ADD COLUMN "apps" TEXT;
