// A trip's shared costs (M215, the owner: "big features … unique … or combine different apps' features
// into one"): who paid what for whom, each person's balance, and the fewest payments that settle it,
// per currency (a bill paid in yen is settled in yen). Amounts are whole cents (minor units ×100 for
// every currency, so yen are counted in hundredths too). Pure: the page and the server use the same sums.

export const EXPENSE_KINDS = [
  { id: 'food', label: 'Food and drink' }, { id: 'stay', label: 'Stays' }, { id: 'travel', label: 'Getting around' },
  { id: 'fun', label: 'Tickets and fun' }, { id: 'shop', label: 'Shopping' }, { id: 'other', label: 'Other' },
] as const;
/** A payment from one person to another to settle up (`paidBy` paid `split[0]`). */
export const SETTLE = 'settle';
export const EXPENSE_IDS = [...EXPENSE_KINDS.map((k) => k.id), SETTLE] as string[];

export interface Expense { id: string; paidBy: string; amount: number; currency: string; split: string[]; category: string; what: string; day: string | null; createdBy: string; createdAt: string }
export interface Transfer { from: string; to: string; amount: number; currency: string }

/** Each person's balance per currency, in cents: above 0, the others owe them; below, they owe. An even
 *  split's leftover cents go to the first people in its list, so the balances always add up to nothing. */
export function balances(list: Expense[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const e of list) {
    if (!e.split.length || e.amount <= 0) continue;
    const net = (out[e.currency] ??= {});
    net[e.paidBy] = (net[e.paidBy] ?? 0) + e.amount;
    const share = Math.floor(e.amount / e.split.length), extra = e.amount - share * e.split.length;
    e.split.forEach((p, i) => { net[p] = (net[p] ?? 0) - share - (i < extra ? 1 : 0); });
  }
  return out;
}

/** The fewest payments (near enough: the biggest debt to the biggest credit, again and again) that bring a
 *  currency's balances to nothing. */
export function settle(net: Record<string, number>, currency: string): Transfer[] {
  const owe = Object.entries(net).filter(([, v]) => v < 0).map(([p, v]) => ({ p, v: -v })).sort((a, b) => b.v - a.v || a.p.localeCompare(b.p));
  const get = Object.entries(net).filter(([, v]) => v > 0).map(([p, v]) => ({ p, v })).sort((a, b) => b.v - a.v || a.p.localeCompare(b.p));
  const out: Transfer[] = [];
  let i = 0, j = 0;
  while (i < owe.length && j < get.length) {
    const amount = Math.min(owe[i].v, get[j].v);
    if (amount > 0) out.push({ from: owe[i].p, to: get[j].p, amount, currency });
    owe[i].v -= amount; get[j].v -= amount;
    if (!owe[i].v) i++;
    if (!get[j].v) j++;
  }
  return out;
}

/** What was spent (settling up left out), per currency, in cents; and per kind. */
export function spent(list: Expense[]): Record<string, { total: number; byKind: Record<string, number> }> {
  const out: Record<string, { total: number; byKind: Record<string, number> }> = {};
  for (const e of list) {
    if (e.category === SETTLE) continue;
    const c = (out[e.currency] ??= { total: 0, byKind: {} });
    c.total += e.amount;
    c.byKind[e.category] = (c.byKind[e.category] ?? 0) + e.amount;
  }
  return out;
}

/** "12.50" or "12,50" or "1 200" typed by a person, in cents (null when it isn't an amount). */
export function readAmount(text: string): number | null {
  const t = text.replace(/[\s ']/g, '');
  // The last , or . with one or two digits after it is the decimal mark; others group thousands.
  const m = /^(\d{1,3}(?:[.,]\d{3})*|\d+)(?:[.,](\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const whole = Number(m[1].replace(/[.,]/g, '')), frac = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  const cents = whole * 100 + frac;
  return cents > 0 && cents <= 1_000_000_000 ? cents : null;
}
