// Assignment rules (Stage 5 · B3.1): a late penalty (% per day after a grace period, up to a
// maximum), a limit on how many times a student may hand in before it's graded, extensions for one
// student, and accommodations set once per student (extra days for assignments, extra time on timed
// quizzes). Pure, so the server and the screens agree; tested in assignment-policy.test.ts.

export const DAY = 86_400_000;

export interface LatePolicy {
  /** % of the score lost per day late (null or 0: no penalty). */
  latePenalty: number | null;
  /** Minutes after the due time that still count as on time. */
  lateGraceMinutes: number;
  /** The most a late submission can lose, in %. */
  latePenaltyMax: number;
}

export interface Accommodation { extraDays: number; extraTimePct: number }
export const NO_ACCOMMODATION: Accommodation = { extraDays: 0, extraTimePct: 0 };

/** A student's due date: their extension if they have one, else the due date plus their extra days. */
export function dueFor(due: Date | null, extension: Date | null, acc: Accommodation = NO_ACCOMMODATION): Date | null {
  if (extension) return extension;
  if (!due) return null;
  return acc.extraDays > 0 ? new Date(due.getTime() + acc.extraDays * DAY) : due;
}

/** How late a submission is (days, each started day counting) and the % it loses. */
export function lateness(submittedAt: Date, due: Date | null, p: LatePolicy): { late: boolean; days: number; penalty: number } {
  if (!due) return { late: false, days: 0, penalty: 0 };
  const over = submittedAt.getTime() - due.getTime();
  if (over <= 0) return { late: false, days: 0, penalty: 0 };
  const afterGrace = over - Math.max(0, p.lateGraceMinutes) * 60_000;
  if (afterGrace <= 0) return { late: false, days: 0, penalty: 0 };
  const days = Math.ceil(afterGrace / DAY);
  const perDay = Math.max(0, p.latePenalty ?? 0);
  const penalty = Math.min(Math.max(0, Math.min(100, p.latePenaltyMax)), days * perDay);
  return { late: true, days, penalty: Math.round(penalty * 100) / 100 };
}

/** The score after a late penalty (to two decimals). */
export const withPenalty = (score: number, penalty: number) => Math.round(score * (1 - Math.min(100, Math.max(0, penalty)) / 100) * 100) / 100;

/** Whether a student may hand in again: maxAttempts null means any number until it's graded. */
export const mayHandIn = (attempts: number, maxAttempts: number | null, extraAttempts = 0) => maxAttempts === null || attempts < maxAttempts + extraAttempts;

/** A timed quiz's minutes for a student with extra time (rounded up). */
export const quizMinutes = (timeLimit: number | null, acc: Accommodation = NO_ACCOMMODATION) =>
  timeLimit ? Math.ceil(timeLimit * (1 + Math.max(0, acc.extraTimePct) / 100)) : null;

/** A policy as the teacher sent it: numbers within range. */
export function cleanPolicy(b: Record<string, unknown>) {
  const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
  const out: { latePenalty?: number | null; lateGraceMinutes?: number; latePenaltyMax?: number; maxAttempts?: number | null } = {};
  if ('latePenalty' in b) out.latePenalty = b.latePenalty === null || b.latePenalty === '' ? null : num(b.latePenalty, 0, 100);
  if ('lateGraceMinutes' in b) out.lateGraceMinutes = Math.round(num(b.lateGraceMinutes, 0, 7 * 24 * 60) ?? 0);
  if ('latePenaltyMax' in b) out.latePenaltyMax = num(b.latePenaltyMax, 0, 100) ?? 100;
  if ('maxAttempts' in b) out.maxAttempts = b.maxAttempts === null || b.maxAttempts === '' ? null : Math.round(num(b.maxAttempts, 1, 20) ?? 1);
  return out;
}

/** An accommodation as sent: up to 30 extra days and up to triple time. */
export function cleanAccommodation(b: Record<string, unknown>): Accommodation {
  const n = (v: unknown, hi: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.min(hi, Math.max(0, x)) : 0; };
  return { extraDays: n(b.extraDays, 30), extraTimePct: n(b.extraTimePct, 200) };
}
