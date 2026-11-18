// Relief's supply forecasts (M313): from what went out of a supply in the last four weeks (its moves),
// the daily use (the last week counts twice), how many days the stock lasts and when to order, with a
// few days' margin for the delivery. Plain maths, shown on an organisation's Supplies.

const DAY = 86_400_000;
export const LEAD_DAYS = 3;
export type Forecast = { perDay: number; daysLeft: number | null; runsOut: string | null; orderBy: string | null; state: 'ok' | 'soon' | 'now' | 'unknown' };

export function forecastSupply(quantity: number, moves: { change: number; createdAt: Date | string }[], now = Date.now()): Forecast {
  const out = moves.filter((m) => m.change < 0).map((m) => ({ n: -m.change, at: new Date(m.createdAt).getTime() })).filter((m) => now - m.at <= 28 * DAY);
  if (!out.length) return { perDay: 0, daysLeft: null, runsOut: null, orderBy: null, state: 'unknown' };
  const week = out.filter((m) => now - m.at <= 7 * DAY).reduce((s, m) => s + m.n, 0);
  const rest = out.filter((m) => now - m.at > 7 * DAY).reduce((s, m) => s + m.n, 0);
  const oldest = Math.min(...out.map((m) => m.at));
  const span = Math.max(7, Math.min(28, Math.ceil((now - oldest) / DAY)));
  // The last week counts twice: (2·week + rest) over (2·7 + the other days).
  const perDay = (2 * week + rest) / (14 + Math.max(0, span - 7));
  if (perDay <= 0) return { perDay: 0, daysLeft: null, runsOut: null, orderBy: null, state: 'unknown' };
  const daysLeft = Math.floor(quantity / perDay);
  const iso = (d: number) => new Date(now + d * DAY).toISOString().slice(0, 10);
  return { perDay: Math.round(perDay * 10) / 10, daysLeft, runsOut: iso(daysLeft), orderBy: iso(Math.max(0, daysLeft - LEAD_DAYS)), state: daysLeft <= LEAD_DAYS ? 'now' : daysLeft <= 10 ? 'soon' : 'ok' };
}
