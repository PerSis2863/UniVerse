/**
 * Demo login support.
 *
 * Demo "mock-token-*" logins skip real authentication, so they are restricted to:
 *   1. environments where DEMO_LOGIN_ENABLED is "true" (defaults to true only outside production), and
 *   2. an explicit allowlist of demo accounts (DEMO_ACCOUNT_EMAILS, comma separated).
 * Real user accounts can never be accessed with a mock token.
 */
const DEFAULT_DEMO_EMAILS = [
  'demo@student.com',
  'demo@teacher.com',
  'demo@admin.com',
  'it-support@universe.com',
];

export function isDemoLoginEnabled(): boolean {
  const flag = process.env.DEMO_LOGIN_ENABLED;
  if (flag !== undefined) return flag.trim().toLowerCase() === 'true';
  return process.env.NODE_ENV !== 'production';
}

export function getDemoAccountEmails(): string[] {
  const raw = process.env.DEMO_ACCOUNT_EMAILS;
  const list = raw && raw.trim().length > 0 ? raw.split(',') : DEFAULT_DEMO_EMAILS;
  return list.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isDemoAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  return getDemoAccountEmails().includes(email.trim().toLowerCase());
}
