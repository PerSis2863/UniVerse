// Green → Business (M269): a company's carbon footprint the way the GHG Protocol counts it. Scope 1 is what the
// company burns or leaks itself, scope 2 the electricity and heat it buys, scope 3 everything else in its value
// chain (travel, freight, waste, what it buys, staff commuting). Every factor here carries its source; they are
// published averages, rounded, and a company may enter its own (a supplier's figure, a meter's) on any line.
// Used by the server (src/server/green-business.ts), which always works the numbers out again, and by the page.

export type Scope = 1 | 2 | 3;
export type CarbonUnit = 'L' | 'kWh' | 'kg' | 'km' | 'pkm' | 'tkm' | 'night' | 'm3' | 'money';
export type CarbonCategory = {
  id: string; label: string; scope: Scope; unit: CarbonUnit; group: string;
  /** The GHG Protocol's scope 3 category number (1–15), for the report. */
  s3?: number;
  /** kg CO₂e per unit; electricity's depends on the country (gridFactor). */
  factor: number; source: string;
  /** Energy in GJ per unit (fuels and electricity), for energy reporting (BRSR, CSRD E1-5). */
  gj?: number;
  /** M276: kg CO₂e upstream per unit (extracting, refining and delivering the fuel: "well to tank"), scope 3 category 3. */
  wtt?: number;
};

const DEFRA = 'UK government GHG conversion factors 2024 (DESNZ/DEFRA)';
const DEFRA_RF = `${DEFRA}, flights with the extra warming of contrails`;
const SPEND = 'Spend-based estimate: US EPA supply-chain factors (USEEIO), rounded, per US dollar';
const AR4 = 'Leaked refrigerant × its global warming potential (IPCC AR4, as the GHG Protocol uses)';

export const UNIT_LABEL: Record<CarbonUnit, string> = { L: 'litres', kWh: 'kWh', kg: 'kg', km: 'km', pkm: 'passenger-km', tkm: 'tonne-km', night: 'nights', m3: 'm³', money: 'spent' };

export const CATEGORIES: CarbonCategory[] = [
  // Scope 1: fuel burnt in the company's own boilers, machines and vehicles, and refrigerant leaks
  { id: 'diesel', label: 'Diesel', scope: 1, unit: 'L', group: 'Fuel and vehicles', factor: 2.51, source: DEFRA, gj: 0.036, wtt: 0.61 },
  { id: 'petrol', label: 'Petrol', scope: 1, unit: 'L', group: 'Fuel and vehicles', factor: 2.08, source: DEFRA, gj: 0.032, wtt: 0.59 },
  { id: 'lpg', label: 'LPG', scope: 1, unit: 'L', group: 'Fuel and vehicles', factor: 1.56, source: DEFRA, gj: 0.0247, wtt: 0.19 },
  { id: 'gas', label: 'Natural gas', scope: 1, unit: 'kWh', group: 'Fuel and vehicles', factor: 0.183, source: DEFRA, gj: 0.0036, wtt: 0.031 },
  { id: 'cng', label: 'CNG (compressed natural gas)', scope: 1, unit: 'kg', group: 'Fuel and vehicles', factor: 2.54, source: DEFRA, gj: 0.047, wtt: 0.43 },
  { id: 'coal', label: 'Coal (industrial)', scope: 1, unit: 'kg', group: 'Fuel and vehicles', factor: 2.4, source: DEFRA, gj: 0.025, wtt: 0.4 },
  { id: 'wood', label: 'Wood pellets or chips', scope: 1, unit: 'kg', group: 'Fuel and vehicles', factor: 0.053, source: `${DEFRA}; the wood’s own CO₂ is biogenic and reported apart`, gj: 0.017, wtt: 0.17 },
  { id: 'heating-oil', label: 'Heating oil', scope: 1, unit: 'L', group: 'Fuel and vehicles', factor: 2.54, source: DEFRA, gj: 0.0358, wtt: 0.53 },
  { id: 'fleet-km', label: 'Company cars (distance)', scope: 1, unit: 'km', group: 'Fuel and vehicles', factor: 0.168, source: `${DEFRA}, an average car`, wtt: 0.045 },
  { id: 'r410a', label: 'Refrigerant R-410A leaked', scope: 1, unit: 'kg', group: 'Refrigerants', factor: 2088, source: AR4 },
  { id: 'r134a', label: 'Refrigerant R-134a leaked', scope: 1, unit: 'kg', group: 'Refrigerants', factor: 1430, source: AR4 },
  { id: 'r32', label: 'Refrigerant R-32 leaked', scope: 1, unit: 'kg', group: 'Refrigerants', factor: 675, source: AR4 },
  { id: 'r404a', label: 'Refrigerant R-404A leaked', scope: 1, unit: 'kg', group: 'Refrigerants', factor: 3922, source: AR4 },
  { id: 'r407c', label: 'Refrigerant R-407C leaked', scope: 1, unit: 'kg', group: 'Refrigerants', factor: 1774, source: AR4 },
  { id: 'r22', label: 'Refrigerant R-22 leaked', scope: 1, unit: 'kg', group: 'Refrigerants', factor: 1810, source: AR4 },
  // Scope 2: bought electricity and heat
  { id: 'electricity', label: 'Electricity from the grid', scope: 2, unit: 'kWh', group: 'Electricity and heat', factor: 0.48, source: 'The country’s average grid (see the note); your supplier’s own figure is better', gj: 0.0036 },
  { id: 'electricity-green', label: 'Electricity on a renewable tariff', scope: 2, unit: 'kWh', group: 'Electricity and heat', factor: 0, source: 'Market-based: 0 with renewable certificates (GHG Protocol scope 2 guidance); keep the certificates', gj: 0.0036 },
  { id: 'heat', label: 'Bought heat or steam', scope: 2, unit: 'kWh', group: 'Electricity and heat', factor: 0.17, source: `${DEFRA}, district heat`, gj: 0.0036 },
  // Scope 3: business travel (6), freight (4), waste (5), water and purchases (1), capital goods (2), commuting (7)
  { id: 'flight-domestic', label: 'Flights, domestic', scope: 3, s3: 6, unit: 'pkm', group: 'Business travel', factor: 0.273, source: DEFRA_RF },
  { id: 'flight-short', label: 'Flights, short-haul (up to ~3,700 km)', scope: 3, s3: 6, unit: 'pkm', group: 'Business travel', factor: 0.186, source: DEFRA_RF },
  { id: 'flight-long', label: 'Flights, long-haul', scope: 3, s3: 6, unit: 'pkm', group: 'Business travel', factor: 0.261, source: DEFRA_RF },
  { id: 'rail', label: 'Train', scope: 3, s3: 6, unit: 'pkm', group: 'Business travel', factor: 0.035, source: DEFRA },
  { id: 'taxi', label: 'Taxi or own car on business', scope: 3, s3: 6, unit: 'km', group: 'Business travel', factor: 0.168, source: `${DEFRA}, an average car` },
  { id: 'hotel', label: 'Hotel nights', scope: 3, s3: 6, unit: 'night', group: 'Business travel', factor: 15, source: `${DEFRA}, hotel stays, a rough world average (10–50 by country)` },
  { id: 'freight-road', label: 'Freight by lorry', scope: 3, s3: 4, unit: 'tkm', group: 'Freight', factor: 0.107, source: `${DEFRA}, average lorry` },
  { id: 'freight-rail', label: 'Freight by rail', scope: 3, s3: 4, unit: 'tkm', group: 'Freight', factor: 0.028, source: DEFRA },
  { id: 'freight-sea', label: 'Freight by sea (container)', scope: 3, s3: 4, unit: 'tkm', group: 'Freight', factor: 0.016, source: DEFRA },
  { id: 'freight-air', label: 'Freight by air', scope: 3, s3: 4, unit: 'tkm', group: 'Freight', factor: 0.6, source: `${DEFRA}, long-haul air freight` },
  { id: 'waste-landfill', label: 'Waste to landfill', scope: 3, s3: 5, unit: 'kg', group: 'Waste and water', factor: 0.467, source: `${DEFRA}, commercial and industrial waste` },
  { id: 'waste-recycled', label: 'Waste recycled', scope: 3, s3: 5, unit: 'kg', group: 'Waste and water', factor: 0.021, source: DEFRA },
  { id: 'waste-compost', label: 'Waste composted', scope: 3, s3: 5, unit: 'kg', group: 'Waste and water', factor: 0.009, source: DEFRA },
  { id: 'water', label: 'Water (supply and treatment)', scope: 3, s3: 1, unit: 'm3', group: 'Waste and water', factor: 0.34, source: `${DEFRA}, supply and treatment together` },
  { id: 'buy-it', label: 'IT and electronics bought', scope: 3, s3: 1, unit: 'money', group: 'Things bought (by spend)', factor: 0.2, source: SPEND },
  { id: 'buy-office', label: 'Office supplies and furniture', scope: 3, s3: 1, unit: 'money', group: 'Things bought (by spend)', factor: 0.3, source: SPEND },
  { id: 'buy-food', label: 'Food and catering', scope: 3, s3: 1, unit: 'money', group: 'Things bought (by spend)', factor: 0.55, source: SPEND },
  { id: 'buy-materials', label: 'Raw materials and parts', scope: 3, s3: 1, unit: 'money', group: 'Things bought (by spend)', factor: 0.6, source: SPEND },
  { id: 'buy-services', label: 'Professional services', scope: 3, s3: 1, unit: 'money', group: 'Things bought (by spend)', factor: 0.1, source: SPEND },
  { id: 'buy-cloud', label: 'Cloud and software', scope: 3, s3: 1, unit: 'money', group: 'Things bought (by spend)', factor: 0.12, source: SPEND },
  { id: 'buy-capital', label: 'Machines, vehicles and buildings bought', scope: 3, s3: 2, unit: 'money', group: 'Things bought (by spend)', factor: 0.4, source: SPEND },
  { id: 'supplier', label: 'From a supplier’s own figures', scope: 3, s3: 1, unit: 'kg', group: 'Suppliers', factor: 1, source: 'The supplier’s own reported emissions, our share by spend' },
  { id: 'commute', label: 'Staff commuting', scope: 3, s3: 7, unit: 'kg', group: 'Staff', factor: 1, source: 'The staff commute survey: distance × days × mode, DEFRA factors' },
  { id: 'upstream', label: 'Fuel and energy upstream (worked out)', scope: 3, s3: 3, unit: 'kg', group: 'Worked out', factor: 1, source: `${'UK government GHG conversion factors 2024 (DESNZ/DEFRA)'}, well-to-tank; electricity’s grid losses and fuel supply as a share of the grid factor` },
];
export const categoryById = (id: unknown) => CATEGORIES.find((c) => c.id === id) ?? null;
/** Categories a person picks for a line (the supplier and commute lines come from those features). */
export const PICKABLE = CATEGORIES.filter((c) => c.id !== 'supplier' && c.id !== 'commute' && c.id !== 'upstream');
/** Lines made by a feature, never typed: a supplier's answer, the staff survey, the worked-out upstream. */
export const MADE = ['supplier', 'commute', 'upstream'];

/** Location-based grid electricity, kg CO₂e per kWh: recent national averages, rounded (IEA, Ember; India: CEA CO₂
 *  baseline database; UK: DESNZ 2024; US: EPA eGRID). A supplier's own figure is better. */
export const GRID: Record<string, number> = {
  IN: 0.716, GB: 0.207, US: 0.373, CA: 0.12, DE: 0.38, FR: 0.056, ES: 0.15, IT: 0.26, NL: 0.33, SE: 0.04, NO: 0.03, IE: 0.29,
  PL: 0.66, AU: 0.62, NZ: 0.11, JP: 0.46, KR: 0.42, CN: 0.58, SG: 0.41, MY: 0.58, ID: 0.68, TH: 0.47, VN: 0.47, PH: 0.61,
  PK: 0.4, BD: 0.55, LK: 0.5, NP: 0.01, AE: 0.4, SA: 0.57, QA: 0.42, EG: 0.47, NG: 0.4, KE: 0.1, ZA: 0.9, BR: 0.08, MX: 0.42,
  AR: 0.33, CL: 0.3, TR: 0.43, RU: 0.36, UA: 0.25,
};
export const WORLD_GRID = 0.48;
export const gridFactor = (country: string | null | undefined) => GRID[(country ?? '').toUpperCase()] ?? WORLD_GRID;

/** US dollars per unit of a currency (rough, for spend-based factors, which are per dollar). */
export const USD_PER: Record<string, number> = { USD: 1, INR: 0.012, EUR: 1.08, GBP: 1.27, AED: 0.27, SGD: 0.74, AUD: 0.66, CAD: 0.73, JPY: 0.0067, CNY: 0.14, PKR: 0.0036, BDT: 0.0084, LKR: 0.0033, NPR: 0.0075, ZAR: 0.054, NGN: 0.00065, KES: 0.0077, BRL: 0.18, MXN: 0.055 };
export const CURRENCIES = Object.keys(USD_PER);

/** The factor for one line: electricity follows the country; spend follows the currency (factors are per US dollar). */
export function factorFor(cat: CarbonCategory, country: string | null | undefined, currency: string | null | undefined): number {
  if (cat.id === 'electricity') return gridFactor(country);
  if (cat.unit === 'money') return cat.factor * (USD_PER[(currency ?? 'USD').toUpperCase()] ?? 1);
  return cat.factor;
}
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** kg CO₂e for a quantity, with the company's own factor when it has one. */
export const kgFor = (quantity: number, factor: number) => r3(Math.max(0, quantity) * Math.max(0, factor));

/** "2026-03" for a month; the year of a period. */
export const isPeriod = (v: unknown): v is string => typeof v === 'string' && /^(19|20)\d\d-(0[1-9]|1[0-2])$/.test(v);
export const yearOf = (period: string) => Number(period.slice(0, 4));

// ——— Staff commuting (scope 3, category 7) ———
/** kg CO₂e per km, one person, by how they come to work (DEFRA 2024; a car shared by two halves it). */
export const COMMUTE: Record<string, { label: string; kgKm: number }> = {
  car: { label: 'Car, alone', kgKm: 0.168 }, carpool: { label: 'Car, shared', kgKm: 0.084 }, ev: { label: 'Electric car', kgKm: 0.047 },
  motorbike: { label: 'Motorbike or scooter', kgKm: 0.114 }, bus: { label: 'Bus', kgKm: 0.102 }, metro: { label: 'Metro or tram', kgKm: 0.029 },
  rail: { label: 'Train', kgKm: 0.035 }, cycle: { label: 'Bike or walking', kgKm: 0 }, home: { label: 'Work from home', kgKm: 0 },
};
export const WORK_WEEKS = 46;
/** A year of one person's commute: there and back, days a week, 46 working weeks. */
export const commuteKgYear = (mode: string, kmOneWay: number, daysWeek: number) => r3((COMMUTE[mode]?.kgKm ?? 0) * Math.min(300, Math.max(0, kmOneWay)) * 2 * Math.min(7, Math.max(0, daysWeek)) * WORK_WEEKS);

// ——— Data quality (M276) ———
/** How good a line's number is, from a meter or invoice down to a guess from money spent: the uncertainty each carries
 *  (the GHG Protocol's uncertainty guidance, as tiers) and a score from 1 (best) to 5, PCAF-style. */
export const QUALITY = {
  measured: { label: 'Measured (meter, invoice, fuel card)', pct: 5, score: 1 },
  calculated: { label: 'Calculated (distance, weight, hours)', pct: 15, score: 2 },
  estimated: { label: 'Estimated (an average or a share)', pct: 30, score: 4 },
  spend: { label: 'From money spent', pct: 50, score: 5 },
} as const;
export type Quality = keyof typeof QUALITY;
export const isQuality = (v: unknown): v is Quality => typeof v === 'string' && v in QUALITY;
export const defaultQuality = (category: string): Quality => (categoryById(category)?.unit === 'money' ? 'spend' : category === 'supplier' ? 'measured' : category === 'commute' ? 'estimated' : 'calculated');

/** Electricity's own upstream (grid losses and the supply of the power stations' fuel) as a share of the grid factor:
 *  the UK's from DESNZ 2024 (T&D plus well-to-tank, about a third), India's higher losses, elsewhere a rough 15%. */
export const ELEC_UPSTREAM: Record<string, number> = { GB: 0.33, IN: 0.2 };
const elecUpstream = (country: string | null | undefined) => ELEC_UPSTREAM[(country ?? '').toUpperCase()] ?? 0.15;

// ——— Totals ———
export type Line = { period: string; category: string; scope: number; kg: number; quantity: number; quality?: string | null; site?: string | null };
export type Totals = {
  kg: number; scope: Record<1 | 2 | 3, number>; byCategory: Record<string, number>; byMonth: Record<string, number>; gj: number;
  /** M276: scope 2 both ways the GHG Protocol asks: the grid's average (location) and the company's own contracts (market). */
  scope2: { location: number; market: number };
  /** kg by data quality, the ± kg (root sum of squares) and the weighted score (1 best, 5 worst). */
  quality: { kg: Record<string, number>; uncertaintyKg: number; score: number };
  bySite: Record<string, number>;
};
/** The year's totals. With `upstream`, fuel and electricity also bring their worked-out upstream (scope 3 category 3). */
export function totals(lines: Line[], year?: number, opts: { country?: string | null; upstream?: boolean } = {}): Totals {
  const t: Totals = { kg: 0, scope: { 1: 0, 2: 0, 3: 0 }, byCategory: {}, byMonth: {}, gj: 0, scope2: { location: 0, market: 0 }, quality: { kg: {}, uncertaintyKg: 0, score: 0 }, bySite: {} };
  let sq = 0, score = 0;
  const grid = gridFactor(opts.country), add = (cat: string, period: string, kg: number, scope: 1 | 2 | 3, q: string, site: string | null | undefined) => {
    t.kg += kg; t.scope[scope] += kg;
    t.byCategory[cat] = (t.byCategory[cat] ?? 0) + kg;
    t.byMonth[period] = (t.byMonth[period] ?? 0) + kg;
    t.quality.kg[q] = (t.quality.kg[q] ?? 0) + kg;
    if (site) t.bySite[site] = (t.bySite[site] ?? 0) + kg;
    sq += (kg * (QUALITY[q as Quality]?.pct ?? 30) / 100) ** 2;
    score += kg * (QUALITY[q as Quality]?.score ?? 4);
  };
  for (const l of lines) {
    if (year && yearOf(l.period) !== year) continue;
    const s = (l.scope === 1 || l.scope === 2 ? l.scope : 3) as 1 | 2 | 3, c = categoryById(l.category);
    add(l.category, l.period, l.kg, s, isQuality(l.quality) ? l.quality : defaultQuality(l.category), l.site);
    t.gj += (c?.gj ?? 0) * l.quantity;
    if (s === 2) {
      t.scope2.market += l.kg;
      t.scope2.location += l.category === 'electricity' || l.category === 'electricity-green' ? l.quantity * grid : l.kg;
    }
    if (opts.upstream && l.category !== 'upstream') {
      const up = (c?.wtt ?? 0) * l.quantity + (l.category === 'electricity' || l.category === 'electricity-green' ? l.quantity * grid * elecUpstream(opts.country) : 0);
      if (up > 0) add('upstream', l.period, up, 3, 'estimated', l.site);
    }
  }
  t.kg = r3(t.kg); t.gj = r3(t.gj); t.scope2 = { location: r3(t.scope2.location), market: r3(t.scope2.market) };
  for (const s of [1, 2, 3] as const) t.scope[s] = r3(t.scope[s]);
  for (const k of Object.keys(t.byCategory)) t.byCategory[k] = r3(t.byCategory[k]);
  for (const k of Object.keys(t.quality.kg)) t.quality.kg[k] = r3(t.quality.kg[k]);
  t.quality.uncertaintyKg = r3(Math.sqrt(sq));
  t.quality.score = t.kg > 0 ? Math.round((score / t.kg) * 10) / 10 : 0;
  return t;
}

// ——— Scope 3's fifteen categories (M277): each counted, not relevant, or left out with a reason ———
export const S3_CATEGORIES: { n: number; name: string; hint: string }[] = [
  { n: 1, name: 'Purchased goods and services', hint: 'What you buy to make or sell: materials, parts, services.' },
  { n: 2, name: 'Capital goods', hint: 'Machines, vehicles, buildings and computers you buy.' },
  { n: 3, name: 'Fuel- and energy-related activities', hint: 'Making and delivering your fuel and power (worked out from your scope 1 and 2 lines).' },
  { n: 4, name: 'Upstream transport and distribution', hint: 'Freight you pay for, to you and between your sites.' },
  { n: 5, name: 'Waste generated in operations', hint: 'Landfill, recycling, compost, treatment.' },
  { n: 6, name: 'Business travel', hint: 'Flights, trains, taxis and hotels for work.' },
  { n: 7, name: 'Employee commuting', hint: 'How staff get to work (the staff survey), and working from home.' },
  { n: 8, name: 'Upstream leased assets', hint: 'Offices or vehicles you lease, if not already in scopes 1 and 2.' },
  { n: 9, name: 'Downstream transport and distribution', hint: 'Delivery of sold products you don’t pay for.' },
  { n: 10, name: 'Processing of sold products', hint: 'What others do to your products before they’re used.' },
  { n: 11, name: 'Use of sold products', hint: 'Energy your products use in their life (cars, appliances, fuels).' },
  { n: 12, name: 'End-of-life treatment of sold products', hint: 'How your products and packaging are thrown away.' },
  { n: 13, name: 'Downstream leased assets', hint: 'Things you own and lease out.' },
  { n: 14, name: 'Franchises', hint: 'Franchisees’ emissions, if you are a franchisor.' },
  { n: 15, name: 'Investments', hint: 'Emissions of what you invest in or lend to (banks, funds).' },
];
export const SCREEN = ['included', 'not-relevant', 'excluded'] as const;
export type Screen = (typeof SCREEN)[number];
/** Tonnes, for people: "12.4 t". */
export const tonnes = (kg: number) => `${(kg / 1000).toLocaleString(undefined, { maximumFractionDigits: kg >= 100_000 ? 0 : 1 })} t`;

// ——— Targets and the reduction planner (M273) ———
/** SBTi's cross-sector pace for 1.5 °C: about 4.2% of the base year's emissions cut each year (absolute contraction). */
export const PACE_15C = 4.2;
/** The straight path from the base year to the target: kg allowed each year. */
export function targetPath(baseKg: number, baseYear: number, targetYear: number, targetPct: number): { year: number; kg: number }[] {
  if (!(targetYear > baseYear) || baseKg <= 0) return [];
  const out: { year: number; kg: number }[] = [];
  for (let y = baseYear; y <= targetYear; y++) out.push({ year: y, kg: r3(baseKg * (1 - (Math.min(100, Math.max(0, targetPct)) / 100) * ((y - baseYear) / (targetYear - baseYear)))) });
  return out;
}

export type LeverId = 'renewable' | 'fleet' | 'heatpump' | 'travel' | 'rail' | 'suppliers' | 'commute' | 'recycling';
export type Lever = { share: number; cost: number; saving: number };
export const LEVERS: { id: LeverId; label: string; what: string }[] = [
  { id: 'renewable', label: 'Renewable electricity', what: 'Share of grid electricity moved to a renewable tariff or your own solar.' },
  { id: 'fleet', label: 'Electric vehicles', what: 'Share of the company’s cars and vans made electric (they then use grid electricity).' },
  { id: 'heatpump', label: 'Heat pumps', what: 'Share of gas or oil heating replaced by heat pumps (three units of heat per unit of electricity).' },
  { id: 'travel', label: 'Fewer business trips', what: 'Share of business travel replaced by video calls.' },
  { id: 'rail', label: 'Train instead of short flights', what: 'Share of domestic and short-haul flights taken by train.' },
  { id: 'suppliers', label: 'Greener suppliers', what: 'How much your suppliers cut what they sell you (ask them in Suppliers).' },
  { id: 'commute', label: 'Greener commuting', what: 'Share of staff commuting emissions cut (transit passes, cycling, days at home).' },
  { id: 'recycling', label: 'Recycle instead of landfill', what: 'Share of landfilled waste recycled instead.' },
];
const sum = (by: Record<string, number>, ids: string[]) => ids.reduce((a, id) => a + (by[id] ?? 0), 0);
/** Tonnes a year each lever cuts from a year's footprint (byCategory, kg), with the country's grid for what's electrified. */
export function leverCuts(byCategory: Record<string, number>, levers: Partial<Record<LeverId, Lever>>, country: string | null | undefined): Record<LeverId, number> {
  const grid = gridFactor(country), s = (id: LeverId) => Math.min(1, Math.max(0, levers[id]?.share ?? 0));
  // An electric car: ~0.18 kWh a km against ~0.168 kg a km; a heat pump: a third of the kWh, from the grid.
  const evLeft = Math.min(1, (0.18 * grid) / 0.168), hpLeft = Math.min(1, grid / 3 / 0.183);
  const kg: Record<LeverId, number> = {
    renewable: sum(byCategory, ['electricity']) * s('renewable'),
    fleet: sum(byCategory, ['diesel', 'petrol', 'fleet-km']) * s('fleet') * (1 - evLeft),
    heatpump: sum(byCategory, ['gas', 'heating-oil']) * s('heatpump') * (1 - hpLeft),
    travel: sum(byCategory, ['flight-domestic', 'flight-short', 'flight-long', 'rail', 'taxi', 'hotel']) * s('travel'),
    rail: sum(byCategory, ['flight-domestic', 'flight-short']) * (1 - s('travel')) * s('rail') * (1 - 0.035 / 0.186),
    suppliers: sum(byCategory, ['buy-it', 'buy-office', 'buy-food', 'buy-materials', 'buy-services', 'buy-cloud', 'supplier', 'water']) * s('suppliers'),
    commute: sum(byCategory, ['commute']) * s('commute'),
    recycling: sum(byCategory, ['waste-landfill']) * s('recycling') * (1 - 0.021 / 0.467),
  };
  for (const k of Object.keys(kg) as LeverId[]) kg[k] = r3(kg[k]);
  return kg;
}
/** Money per tonne cut, over ten years: (one-off cost ÷ 10 − yearly saving) ÷ tonnes cut a year. Below 0 pays for itself. */
export function costPerTonne(l: Lever | undefined, kgCut: number): number | null {
  if (!l || kgCut <= 0 || (!l.cost && !l.saving)) return null;
  return Math.round(((l.cost || 0) / 10 - (l.saving || 0)) / (kgCut / 1000));
}
