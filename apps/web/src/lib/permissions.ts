// Permissions for custom roles (Stage 5 · B15.6; src/server/permissions.ts). Admins have every one;
// a custom role gives some of them to staff accounts. "Manage" includes "see" in the same area.
// New areas add their keys here and check them with can(user, key) on the server.

export const PERMISSIONS = {
  'fees.view': { area: 'School fees', label: 'See fee plans, bills, receipts and totals' },
  'fees.manage': { area: 'School fees', label: 'Make and issue fee plans, record payments, discounts and reminders' },
  'admissions.review': { area: 'Admissions', label: 'Read applications and score them' },
  'admissions.manage': { area: 'Admissions', label: 'Run admission rounds, move applications, make offers and enrol' },
  'import.run': { area: 'Import & export', label: 'Import from spreadsheets and undo imports' },
  'export.run': { area: 'Import & export', label: 'Export people, enrolments, courses and the timetable' },
  'forms.school': { area: 'Parent forms', label: 'Send consent forms to every student’s parents and see all forms' },
  'staff.manage': { area: 'Staff', label: 'Approve leave, plan cover for absent teachers and see who’s in' },
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];
const IMPLIES: Partial<Record<Permission, Permission[]>> = { 'fees.manage': ['fees.view'], 'admissions.manage': ['admissions.review'] };

export const isPermission = (v: unknown): v is Permission => typeof v === 'string' && Object.hasOwn(PERMISSIONS, v);

/** A set of permissions with what each one includes ("manage" brings "see"). */
export function expand(perms: Iterable<string>): Set<Permission> {
  const out = new Set<Permission>();
  for (const p of perms) {
    if (!isPermission(p)) continue;
    out.add(p);
    for (const q of IMPLIES[p] ?? []) out.add(q);
  }
  return out;
}

/** In the browser: whether this signed-in user may do something (admins may do everything). */
export const userCan = (user: { role?: string; permissions?: string[] } | null | undefined, p: Permission) =>
  !!user && (user.role === 'ADMIN' || expand(user.permissions ?? []).has(p));
