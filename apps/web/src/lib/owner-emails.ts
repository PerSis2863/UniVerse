// The owner's email addresses: SUPER_ADMIN_EMAILS (comma separated), or the default. No imports:
// the Worker (cloudflare/) uses this too.

export const DEFAULT_OWNER_EMAILS = 'universeimpact1@gmail.com';

export function ownerEmailList(raw?: unknown): string[] {
  return String(raw || DEFAULT_OWNER_EMAILS).split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}
