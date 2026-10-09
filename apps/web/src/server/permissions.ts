import prisma from '@/lib/db';
import { PERMISSION_KEYS, PERMISSIONS, expand, isPermission, type Permission } from '@/lib/permissions';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from './http';

// Custom roles and permissions (Stage 5 · B15.6). Admins make roles as sets of permissions
// (src/lib/permissions.ts) and put staff accounts in them; can(user, 'fees.manage') replaces "is an
// admin" in the areas that use it (fees, admissions, import/export, school-wide parent forms).
// Admins can do everything; parent accounts and students nothing extra. A person's permissions
// are kept for 30 seconds per server instance (and forgotten at once when their roles change here).

const TTL_MS = 30_000;
const cache = new Map<string, { perms: Set<Permission>; at: number }>();
const forget = (userIds: string[]) => userIds.forEach((id) => cache.delete(id));
const parse = (s: string): string[] => { try { const x = JSON.parse(s); return Array.isArray(x) ? x : []; } catch { return []; } };

/** What this person may do beyond their account type (admins: everything). */
export async function permissionsOf(user: { id: string; role: string }): Promise<Set<Permission>> {
  if (user.role === 'ADMIN') return new Set(PERMISSION_KEYS);
  if (user.role !== 'TEACHER') return new Set();
  const hit = cache.get(user.id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.perms;
  const rows = await prisma.staffRoleMember.findMany({ where: { userId: user.id }, select: { role: { select: { permissions: true } } }, take: 20 });
  const perms = expand(rows.flatMap((r) => parse(r.role.permissions)));
  cache.set(user.id, { perms, at: Date.now() });
  return perms;
}

export const can = async (user: { id: string; role: string }, p: Permission) => (await permissionsOf(user)).has(p);

/** Throws unless this person may do it. */
export async function need(user: SessionUser, p: Permission) {
  if (!(await can(user, p))) throw new ForbiddenException(`You need the “${PERMISSIONS[p].label.toLowerCase()}” permission. Ask a school admin.`);
}

// ── Managing roles (admins only) ────────────────────────────────────────────────────────────

const adminOnly = (u: SessionUser) => { if (u.role !== 'ADMIN') throw new ForbiddenException('Only school admins manage roles.'); };

/** GET /api/admin/roles: every role with its members; the permission list. */
export async function listRoles(user: SessionUser) {
  adminOnly(user);
  const roles = await prisma.staffRole.findMany({
    orderBy: { name: 'asc' }, take: 100,
    select: { id: true, name: true, description: true, permissions: true, updatedAt: true, members: { orderBy: { createdAt: 'asc' }, take: 200, select: { user: { select: { id: true, name: true, email: true, avatar: true } } } } },
  });
  return {
    permissions: PERMISSION_KEYS.map((key) => ({ key, ...PERMISSIONS[key] })),
    roles: roles.map((r) => ({ ...r, permissions: parse(r.permissions).filter(isPermission), members: r.members.map((m) => m.user) })),
  };
}

function readRole(b: Record<string, unknown>) {
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 60) : '';
  if (!name) throw new BadRequestException('Give the role a name, like “Accountant”.');
  const description = typeof b.description === 'string' ? b.description.trim().slice(0, 300) || null : null;
  const permissions = [...new Set(Array.isArray(b.permissions) ? b.permissions.filter(isPermission) : [])];
  if (!permissions.length) throw new BadRequestException('Choose at least one permission.');
  return { name, description, permissions };
}

/** POST /api/admin/roles { name, description?, permissions } */
export async function createRole(user: SessionUser, b: Record<string, unknown>) {
  adminOnly(user);
  const r = readRole(b);
  if (await prisma.staffRole.findUnique({ where: { name: r.name }, select: { id: true } })) throw new ConflictException('There’s already a role with that name.');
  return prisma.staffRole.create({ data: { ...r, permissions: JSON.stringify(r.permissions), createdById: user.id }, select: { id: true, name: true } });
}

/**
 * POST /api/admin/roles/:id { action: 'save', name, description?, permissions } | { action: 'delete' }
 * | { action: 'add', userId } | { action: 'remove', userId }. Only staff (teacher) accounts join roles.
 */
export async function roleAction(user: SessionUser, id: string, b: Record<string, unknown>) {
  adminOnly(user);
  const role = await prisma.staffRole.findUnique({ where: { id }, select: { id: true, name: true, members: { select: { userId: true } } } });
  if (!role) throw new NotFoundException('That role doesn’t exist.');
  const memberIds = role.members.map((m) => m.userId);
  switch (b.action) {
    case 'save': {
      const r = readRole(b);
      const clash = await prisma.staffRole.findUnique({ where: { name: r.name }, select: { id: true } });
      if (clash && clash.id !== id) throw new ConflictException('There’s already a role with that name.');
      await prisma.staffRole.update({ where: { id }, data: { ...r, permissions: JSON.stringify(r.permissions), updatedAt: new Date() } });
      forget(memberIds);
      return { saved: true, name: r.name };
    }
    case 'delete': {
      await prisma.staffRole.delete({ where: { id } });
      forget(memberIds);
      return { deleted: true, name: role.name, members: memberIds.length };
    }
    case 'add':
    case 'remove': {
      const userId = typeof b.userId === 'string' ? b.userId : '';
      const person = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true } });
      if (!person) throw new NotFoundException('That person doesn’t exist.');
      if (b.action === 'add') {
        if (person.role !== 'TEACHER') throw new BadRequestException(person.role === 'ADMIN' ? `${person.name} is an admin and can already do everything.` : 'Roles are for staff accounts.');
        await prisma.staffRoleMember.upsert({ where: { roleId_userId: { roleId: id, userId } }, update: {}, create: { roleId: id, userId, assignedById: user.id } });
      } else {
        await prisma.staffRoleMember.deleteMany({ where: { roleId: id, userId } });
      }
      forget([userId]);
      return { [b.action === 'add' ? 'added' : 'removed']: person.name, role: role.name };
    }
    default: throw new BadRequestException('Unknown action.');
  }
}

/** GET /api/admin/roles/people?q=: staff accounts matching a name or email, to add to a role. */
export async function findStaff(user: SessionUser, q: string) {
  adminOnly(user);
  const text = q.trim().slice(0, 60);
  if (text.length < 2) return { people: [] };
  const people = await prisma.user.findMany({
    where: { role: 'TEACHER', status: { not: 'SUSPENDED' }, OR: [{ name: { contains: text } }, { email: { contains: text.toLowerCase() } }] },
    orderBy: { name: 'asc' }, take: 10, select: { id: true, name: true, email: true, avatar: true },
  });
  return { people };
}
