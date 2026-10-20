// The owner console's school list (Stage 5 · Q19, src/server/modules/owner-console.ts): how each
// school is doing, in plain words. Pure, so it is unit-tested.

const DAY = 86_400_000;

export interface SchoolNumbers {
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | string | null;
  seats: number;
  members: number;
  active: number;
  open: number;
}

export type Health = 'good' | 'watch' | 'risk';

/** "risk": money is about to be lost; "watch": something to look at; "good" otherwise. */
export function schoolHealth(s: SchoolNumbers, now = Date.now()): { health: Health; reasons: string[] } {
  const risk: string[] = [], watch: string[] = [];
  if (s.subscriptionStatus && ['past_due', 'unpaid', 'incomplete'].includes(s.subscriptionStatus)) risk.push('Payment failed');
  if (s.subscriptionStatus === 'canceled') risk.push('Subscription cancelled');
  else if (s.cancelAtPeriodEnd) risk.push('Cancels at the end of this period');
  const trialLeft = s.trialEndsAt ? new Date(s.trialEndsAt).getTime() - now : NaN;
  if ((!s.subscriptionStatus || s.subscriptionStatus === 'trialing') && trialLeft > 0 && trialLeft < 3 * DAY) {
    watch.push(`Trial ends in ${Math.max(1, Math.ceil(trialLeft / DAY))} day${trialLeft > DAY ? 's' : ''}`);
  }
  if (s.members >= 5 && s.active / s.members < 0.2) watch.push('Few people active this week');
  if (s.members > s.seats) watch.push(`Over its seats (${s.members} of ${s.seats})`);
  if (s.open >= 5) watch.push(`${s.open} open safety reports`);
  return { health: risk.length ? 'risk' : watch.length ? 'watch' : 'good', reasons: [...risk, ...watch] };
}
