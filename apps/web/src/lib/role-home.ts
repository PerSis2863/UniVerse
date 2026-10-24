// Where someone's app starts: the owner console, or Trace (business mode, src/lib/business.ts).
// Parents and guardians (Stage 5 · B16.1) have only the parent app.
export function homeFor(user: { role?: string | null; owner?: boolean | null } | null | undefined): string {
  if (!user?.role) return '/login';
  if (user.owner) return '/console';
  return user.role === 'GUARDIAN' ? '/parent' : '/trace';
}
