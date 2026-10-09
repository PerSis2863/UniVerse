-- Stage 5 · B15.6: custom roles and permissions. Admins make roles (Accountant, Admissions officer,
-- Office manager…) as sets of permissions (src/lib/permissions.ts) and put staff accounts in them.
-- Admins have every permission; a role only adds to what a staff account can do.
CREATE TABLE "staff_roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_roles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "staff_roles_name_key" ON "staff_roles"("name");

CREATE TABLE "staff_role_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_role_members_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "staff_roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staff_role_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "staff_role_members_roleId_userId_key" ON "staff_role_members"("roleId", "userId");
CREATE INDEX "staff_role_members_userId_idx" ON "staff_role_members"("userId");
