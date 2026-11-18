import type { HomeEnergyKind } from './green';

// Home energy from bills (M317): a household's months side by side, each month's kg CO₂e per kind and per
// person, and how a month compares with the same month a year before and with the household's average.

export type Bill = { month: string; kind: HomeEnergyKind; kg: number };
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function byMonth(bills: Bill[], people = 1) {
  const months = [...new Set(bills.map((b) => b.month))].sort();
  return months.map((month) => {
    const these = bills.filter((b) => b.month === month);
    const kg = these.reduce((s, b) => s + b.kg, 0);
    return { month, kg: Math.round(kg * 10) / 10, perPerson: Math.round((kg / Math.max(1, people)) * 10) / 10, kinds: Object.fromEntries(these.map((b) => [b.kind, b.kg])) as Partial<Record<HomeEnergyKind, number>> };
  });
}

/** The latest month against the same month a year before and the household's average (percent, rounded). */
export function compareLatest(months: ReturnType<typeof byMonth>) {
  const last = months.at(-1);
  if (!last) return null;
  const [y, m] = last.month.split('-');
  const yearAgo = months.find((x) => x.month === `${Number(y) - 1}-${m}`);
  const others = months.slice(0, -1);
  const avg = others.length ? others.reduce((s, x) => s + x.kg, 0) / others.length : null;
  const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
  return { month: last.month, kg: last.kg, vsYearAgo: yearAgo ? pct(last.kg, yearAgo.kg) : null, vsAverage: avg !== null ? pct(last.kg, avg) : null };
}
