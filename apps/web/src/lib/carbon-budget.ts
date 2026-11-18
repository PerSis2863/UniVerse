// A monthly carbon budget with a forecast (M319). The month's footprint comes from the person's latest
// footprint answers (a twelfth of each part), with home energy from this month's bills when there are
// some; what they saved with confirmed actions comes off. So far is the share of the month gone by; the
// forecast is where the month ends at this rate. Plain maths, shown on Green → Goals.

export const FAIR_SHARE_KG_MONTH = 208; // about 2.5 t a year: a 1.5 °C lifestyle by 2030 (IGES, 2019), a twelfth
export type Part = { id: string; label: string; kg: number };

export function monthPlan(o: { parts: Part[] | null; billsKg: number | null; savedKg: number; now?: Date }) {
  const now = o.now ?? new Date();
  const days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsed = Math.min(1, Math.max(1 / (days * 24), (now.getUTCDate() - 1 + now.getUTCHours() / 24) / days));
  if (!o.parts) return null;
  const month = o.parts.map((p) => ({ id: p.id, label: p.label, kg: p.id === 'home' && o.billsKg !== null ? o.billsKg : p.kg / 12, fromBills: p.id === 'home' && o.billsKg !== null }));
  const gross = month.reduce((s, p) => s + p.kg, 0);
  const savedForecast = elapsed > 0 ? o.savedKg / elapsed : o.savedKg;
  const r = (v: number) => Math.round(v);
  return {
    parts: month.map((p) => ({ ...p, kg: r(p.kg) })),
    elapsed: Math.round(elapsed * 100) / 100,
    soFar: r(gross * elapsed - o.savedKg),
    forecast: r(Math.max(0, gross - savedForecast)),
    saved: r(o.savedKg),
  };
}

export function budgetState(forecast: number, budget: number) {
  const over = forecast - budget;
  return { over: Math.round(over), state: over <= 0 ? 'under' : over <= budget * 0.1 ? 'close' : 'over' } as const;
}
