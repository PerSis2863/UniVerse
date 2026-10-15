// What the owner should watch of Cloudflare usage (cloudflare/usage-guard.ts writes both): on
// Workers Paid, this billing month against what the $5 includes; on Workers Free, today's daily
// allowances (reset 00:00 UTC) plus files this month, the only thing a free account is charged for.

export interface UsageMeter { key: string; label: string; used: number | null; limit: number; bytes?: boolean }

const parse = <T>(raw: string | null | undefined, fallback: T): T => {
  try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
};

export const paidPlan = () => process.env.WORKERS_PAID?.trim().toLowerCase() === 'true';

/** The meters that matter for this plan, and whether they count today or this month. */
export function watchedUsage(guard: { meters: string | null; daily?: string | null } | null): { meters: UsageMeter[]; today: boolean } {
  const monthly = parse<UsageMeter[]>(guard?.meters, []);
  if (paidPlan()) return { meters: monthly, today: false };
  const daily = parse<{ day?: string; meters?: UsageMeter[] } | null>(guard?.daily, null);
  // Yesterday's figures don't count once the day has reset.
  const todays = daily?.day === new Date().toISOString().slice(0, 10) ? daily.meters ?? [] : [];
  return { meters: [...todays, ...monthly.filter((m) => m.key.startsWith('files'))], today: true };
}
