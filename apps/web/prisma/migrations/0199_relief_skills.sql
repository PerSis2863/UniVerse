-- M149: Relief, skills matching (the owner, 10 Nov 2026). Helpers list what they can do with their
-- nearby alerts (relief_watches.skills, comma-separated SKILLS); a need can say which one it needs
-- (relief_posts.skill). A helper with that skill hears about it within their radius even when they
-- asked for urgent needs only or for other kinds.

ALTER TABLE "relief_watches" ADD COLUMN "skills" TEXT;
ALTER TABLE "relief_posts" ADD COLUMN "skill" TEXT;
