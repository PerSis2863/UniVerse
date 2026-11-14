-- M179: each app has its own Messages (the owner, 13 Nov 2026: "when people login in specific app or
-- section like relief, green, play or any then they should get there own new message section but also
-- have option to sync the data of there other app … messages together"). A chat belongs to the app it
-- was started in (campus, trace, relief, green, play); chats from before M179 (NULL) belong to
-- UniVersity. The list shows the app you're in; "All apps" shows them together.

ALTER TABLE "conversations" ADD COLUMN "app" TEXT;
