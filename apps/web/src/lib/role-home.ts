// Where someone's app starts: the owner console, or their role's home. Parents and guardians
// (Stage 5 · B16.1) have only the parent app.
const HOMES: Record<string, string> = { TEACHER: '/teacher', ADMIN: '/admin', GUARDIAN: '/parent' };

export function homeFor(user: { role?: string | null; owner?: boolean | null } | null | undefined): string {
  if (!user?.role) return '/login';
  if (user.owner) return '/console';
  return HOMES[user.role] ?? '/student';
}
