// Staff leave balances (Stage 5 · Q22, B15.8). The school gives each kind of leave a number of days a
// year (0: no limit); a leave year starts in a month the school chooses (January, or April for an
// April–March year). Leave counts working days only (Saturdays and Sundays don't), half a day for a
// half-day leave, and only the part inside the year. Pure and unit-tested; dates are YYYY-MM-DD.

export type HalfDay = 'AM' | 'PM' | null;
export interface LeaveSpan { type: string; fromDate: string; toDate: string; halfDay?: string | null; status: string }

const utc = (d: string) => new Date(`${d}T12:00:00Z`);
const day = (t: Date) => t.toISOString().slice(0, 10);

/** The leave year that contains `today` (YYYY-MM-DD), starting on the 1st of `startMonth` (1–12). */
export function leaveYear(today: string, startMonth = 1): { from: string; to: string; label: string } {
  const m = Math.min(12, Math.max(1, Math.round(startMonth) || 1));
  const [y, mo] = today.split('-').map(Number);
  const startYear = mo >= m ? y : y - 1;
  const from = `${startYear}-${String(m).padStart(2, '0')}-01`;
  const end = utc(`${m === 1 ? startYear + 1 : startYear + 1}-${String(m).padStart(2, '0')}-01`);
  end.setUTCDate(end.getUTCDate() - 1);
  return { from, to: day(end), label: m === 1 ? String(startYear) : `${startYear}–${String((startYear + 1) % 100).padStart(2, '0')}` };
}

/** Working days (Monday to Friday) from a to b, both included; 0.5 for a single half day. */
export function workingDays(a: string, b: string, halfDay?: string | null): number {
  if (b < a) return 0;
  let n = 0;
  for (let t = utc(a); day(t) <= b; t.setUTCDate(t.getUTCDate() + 1)) { const w = t.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return halfDay && a === b && n ? 0.5 : n;
}

/** How much of each kind of leave is used (approved) and asked for (pending) in the year. */
export function leaveUsed(leaves: LeaveSpan[], year: { from: string; to: string }) {
  const out: Record<string, { used: number; pending: number }> = {};
  for (const l of leaves) {
    if (l.status !== 'APPROVED' && l.status !== 'PENDING') continue;
    const a = l.fromDate < year.from ? year.from : l.fromDate, b = l.toDate > year.to ? year.to : l.toDate;
    const n = workingDays(a, b, l.fromDate === l.toDate ? l.halfDay : null);
    if (!n) continue;
    const row = (out[l.type] ??= { used: 0, pending: 0 });
    if (l.status === 'APPROVED') row.used += n; else row.pending += n;
  }
  return out;
}

/** Each kind's allowance, used, pending and left (null left: no limit). */
export function balances(allowances: Record<string, number>, leaves: LeaveSpan[], year: { from: string; to: string }, types: readonly string[]) {
  const used = leaveUsed(leaves, year);
  return types.map((type) => {
    const allowance = Math.max(0, Number(allowances[type]) || 0);
    const u = used[type] ?? { used: 0, pending: 0 };
    return { type, allowance, used: u.used, pending: u.pending, left: allowance ? allowance - u.used : null };
  });
}

/** Whether a class time falls in the half of the day a half-day leave covers (morning ends at noon). */
export const inHalf = (half: string | null | undefined, start: string) => !half || (half === 'AM' ? start < '12:00' : start >= '12:00');
