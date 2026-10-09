import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { createRole, listRoles } from '@/server/permissions';

// Custom roles (Stage 5 · B15.6; src/server/permissions.ts). GET: roles with members. POST { name, description?, permissions }.
export const GET = (req: Request) => route(req, (user) => listRoles(user));
export const POST = (req: Request) => route(req, async (user) => {
  const role = await createRole(user, await req.json().catch(() => ({})));
  audit(user, { action: 'roles.created', summary: `Made the role “${role.name}”`, targetType: 'staff-role', targetId: role.id }, req);
  return role;
});
