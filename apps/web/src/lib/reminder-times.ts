// When to be reminded about a message (Stage 5 · B7.1): the quick choices, worked out from the
// person's own clock. Reminders go out with the 15-minute check, so they can be up to 15 minutes late.

/** The furthest ahead a reminder can be. */
export const MAX_AHEAD_MS = 60 * 24 * 60 * 60_000;

export interface Choice { id: string; label: string; at: Date }

const at = (base: Date, days: number, hour: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** In 20 minutes, in an hour, in 3 hours, this evening (before 5 pm), tomorrow morning, next Monday morning. */
export function reminderChoices(now: Date): Choice[] {
  const t = now.getTime();
  const out: Choice[] = [
    { id: '20m', label: 'In 20 minutes', at: new Date(t + 20 * 60_000) },
    { id: '1h', label: 'In 1 hour', at: new Date(t + 60 * 60_000) },
    { id: '3h', label: 'In 3 hours', at: new Date(t + 3 * 60 * 60_000) },
  ];
  if (now.getHours() < 17) out.push({ id: 'evening', label: 'This evening', at: at(now, 0, 18) });
  out.push({ id: 'tomorrow', label: 'Tomorrow morning', at: at(now, 1, 9) });
  // Next Monday (a week on, if it's Monday today).
  const toMonday = ((8 - now.getDay()) % 7) || 7;
  out.push({ id: 'monday', label: 'Next week', at: at(now, toMonday, 9) });
  return out;
}

/** Snoozing a reminder that came up: an hour, or tomorrow morning. */
export function snoozeChoices(now: Date): Choice[] {
  return reminderChoices(now).filter((c) => c.id === '1h' || c.id === 'tomorrow');
}

/** A time typed in a date-and-time field is usable: in the future, within 60 days. */
export function validReminderTime(when: Date, now: Date) {
  const ms = when.getTime() - now.getTime();
  return Number.isFinite(ms) && ms >= 60_000 && ms <= MAX_AHEAD_MS;
}
