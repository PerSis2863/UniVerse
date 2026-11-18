// Comparing products side by side (M311): the facts a buyer weighs, from each product's passport, and
// which product does best on each (lower is better for carbon and price, higher for the rest).

export type CompareRow = {
  id: string; name: string; brand: string; category: string | null; imageUrl: string | null;
  price: number | null; currency: string | null; warrantyMonths: number; stars: number | null; reviews: number;
  carbonKg: number | null; recycledContent: number | null; recyclable: number | null; durabilityYears: number | null; repairScore: number | null; madeIn: string | null;
};

export const FACTS: { key: keyof CompareRow; label: string; better: 'low' | 'high' | null; unit?: string }[] = [
  { key: 'price', label: 'Price', better: 'low' },
  { key: 'warrantyMonths', label: 'Warranty', better: 'high', unit: 'months' },
  { key: 'stars', label: 'Rating', better: 'high', unit: '/ 5' },
  { key: 'carbonKg', label: 'Carbon to make one', better: 'low', unit: 'kg CO₂e' },
  { key: 'recycledContent', label: 'Recycled material', better: 'high', unit: '%' },
  { key: 'recyclable', label: 'Recyclable', better: 'high', unit: '%' },
  { key: 'durabilityYears', label: 'Expected life', better: 'high', unit: 'years' },
  { key: 'repairScore', label: 'Repairability', better: 'high', unit: '/ 10' },
  { key: 'madeIn', label: 'Made in', better: null },
];

/** For each fact, the ids of the products that do best (none when fewer than two have a value, or all tie). */
export function bestOf(rows: CompareRow[]): Partial<Record<keyof CompareRow, string[]>> {
  const out: Partial<Record<keyof CompareRow, string[]>> = {};
  for (const f of FACTS) {
    if (!f.better) continue;
    const have = rows.filter((r) => typeof r[f.key] === 'number' && (f.key !== 'price' || r.currency === rows.find((x) => x.price !== null)?.currency));
    if (have.length < 2) continue;
    const vals = have.map((r) => r[f.key] as number);
    const target = f.better === 'low' ? Math.min(...vals) : Math.max(...vals);
    if (vals.every((v) => v === target)) continue;
    out[f.key] = have.filter((r) => r[f.key] === target).map((r) => r.id);
  }
  return out;
}
