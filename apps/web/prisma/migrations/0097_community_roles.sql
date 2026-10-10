-- Stage 5 · B7.4: channel categories and permissions in communities. Custom roles with a colour
-- ("Class rep", "Volunteers") that moderators give to members; channels get a category heading,
-- can be private (seen only by moderators and chosen roles), and announcement channels can let
-- chosen roles post. A private channel's participants are kept to those who can see it.
CREATE TABLE "community_roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "community_roles_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "community_roles_communityId_idx" ON "community_roles"("communityId");
ALTER TABLE "community_members" ADD COLUMN "roleIds" TEXT;
ALTER TABLE "conversations" ADD COLUMN "channelCategory" TEXT;
ALTER TABLE "conversations" ADD COLUMN "channelPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN "channelRoles" TEXT;
