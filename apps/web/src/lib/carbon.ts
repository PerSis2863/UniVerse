// A club's carbon tracker (Stage 5 · Q16): what it did, times a standard factor, gives kg CO2e.
// Factors are rounded from the UK Government GHG Conversion Factors for Company Reporting (2024,
// DESNZ) and, for electricity, India's grid factor (Central Electricity Authority, CO2 Baseline
// Database). They're approximate: good for seeing what matters and tracking change, not for audits.

export interface Activity {
  key: string; label: string; unit: string; kgPerUnit: number; group: 'Travel' | 'Energy' | 'Materials' | 'Saved';
  /** A saving: the kg avoided compared with the usual way (shown as saved, never added to the total). */
  saving?: boolean;
}

export const ACTIVITIES: Activity[] = [
  { key: 'car-petrol', label: 'Car (petrol)', unit: 'km', kgPerUnit: 0.16, group: 'Travel' },
  { key: 'car-diesel', label: 'Car (diesel)', unit: 'km', kgPerUnit: 0.17, group: 'Travel' },
  { key: 'motorbike', label: 'Motorbike or scooter', unit: 'km', kgPerUnit: 0.11, group: 'Travel' },
  { key: 'bus', label: 'Bus, per person', unit: 'person-km', kgPerUnit: 0.1, group: 'Travel' },
  { key: 'train', label: 'Train, per person', unit: 'person-km', kgPerUnit: 0.035, group: 'Travel' },
  { key: 'flight-domestic', label: 'Domestic flight, per person', unit: 'person-km', kgPerUnit: 0.25, group: 'Travel' },
  { key: 'electricity', label: 'Electricity (India grid)', unit: 'kWh', kgPerUnit: 0.72, group: 'Energy' },
  { key: 'diesel-generator', label: 'Diesel generator', unit: 'litres', kgPerUnit: 2.66, group: 'Energy' },
  { key: 'lpg', label: 'LPG cooking gas', unit: 'kg', kgPerUnit: 2.94, group: 'Energy' },
  { key: 'paper', label: 'Paper (printing, posters)', unit: 'kg', kgPerUnit: 0.92, group: 'Materials' },
  { key: 'walk-cycle', label: 'Walked or cycled instead of driving', unit: 'km', kgPerUnit: 0.16, group: 'Saved', saving: true },
  { key: 'bus-not-car', label: 'Took the bus instead of driving', unit: 'person-km', kgPerUnit: 0.06, group: 'Saved', saving: true },
  { key: 'train-not-flight', label: 'Took the train instead of flying', unit: 'person-km', kgPerUnit: 0.215, group: 'Saved', saving: true },
];
export const CARBON_SOURCES = 'UK Government GHG Conversion Factors 2024 (DESNZ) and India’s Central Electricity Authority grid factor, rounded';

export const activityOf = (key: unknown) => ACTIVITIES.find((a) => a.key === key) ?? null;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** kg CO2e for an amount of an activity (one decimal), or null for an unknown activity or a bad amount. */
export function kgFor(key: unknown, quantity: unknown): number | null {
  const a = activityOf(key);
  const q = Number(quantity);
  if (!a || !Number.isFinite(q) || q <= 0 || q > 1_000_000) return null;
  return round1(a.kgPerUnit * q);
}

export interface CarbonRow { activity: string; kgCo2e: number; occurredAt: string | Date }
/** Totals: emitted and saved (kg), by activity, and by month (YYYY-MM), newest month first. */
export function carbonSummary(rows: CarbonRow[]) {
  let emitted = 0, saved = 0;
  const byActivity = new Map<string, number>();
  const byMonth = new Map<string, { emitted: number; saved: number }>();
  for (const r of rows) {
    const a = activityOf(r.activity);
    const month = new Date(r.occurredAt).toISOString().slice(0, 7);
    const m = byMonth.get(month) ?? { emitted: 0, saved: 0 };
    if (a?.saving) { saved += r.kgCo2e; m.saved += r.kgCo2e; } else { emitted += r.kgCo2e; m.emitted += r.kgCo2e; }
    byActivity.set(r.activity, (byActivity.get(r.activity) ?? 0) + r.kgCo2e);
    byMonth.set(month, m);
  }
  return {
    emitted: round1(emitted), saved: round1(saved),
    byActivity: [...byActivity.entries()].map(([key, kg]) => ({ key, label: activityOf(key)?.label ?? key, kg: round1(kg), saving: !!activityOf(key)?.saving })).sort((x, y) => y.kg - x.kg),
    byMonth: [...byMonth.entries()].map(([month, v]) => ({ month, emitted: round1(v.emitted), saved: round1(v.saved) })).sort((x, y) => y.month.localeCompare(x.month)),
  };
}
