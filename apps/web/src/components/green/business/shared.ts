import { CATEGORIES, GRID, UNIT_LABEL, categoryById, type Totals } from '@/lib/carbon-ledger';

// Green → Business (M269–M275): what the business screens share: the shapes the server answers with, the field
// styles of Green's other forms, and how numbers read.

export type Role = 'owner' | 'editor' | 'viewer';
export type BizOrgRow = { id: string; name: string; kind: 'company' | 'consultancy'; role: Role; consultancy: string | null; consultancyId: string | null };
export type BizOrg = {
  id: string; name: string; kind: 'company' | 'consultancy'; country: string | null; industry: string | null; employees: number | null;
  revenue: number | null; currency: string; baseYear: number | null; targetYear: number | null; targetPct: number | null; consultancyId: string | null;
};
export type Lever = { share: number; cost: number; saving: number };
export type BizOverview = {
  org: BizOrg; role: Role; year: number; consultancy: string | null; totals: Totals; before: Totals; years: number[];
  counts: { lines: number; suppliers: number; answered: number; commutes: number }; plan: { levers: Record<string, Lever> };
};
export type Entry = { id: string; period: string; category: string; scope: number; quantity: number; factor: number; factorSource: string; kg: number; note: string | null; source: string; refId: string | null; updatedAt: string };

export const field = 'mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white';
export const label = 'block text-xs font-semibold text-zinc-600 dark:text-zinc-300';
export const h3 = 'flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white';
export const icon = 'h-5 w-5 text-emerald-600 dark:text-emerald-400';
export const muted = 'text-sm text-zinc-600 dark:text-zinc-300';
export const SCOPE_TEXT: Record<number, { title: string; what: string; tone: string }> = {
  1: { title: 'Scope 1', what: 'Fuel you burn and refrigerant you leak', tone: '#047857' },
  2: { title: 'Scope 2', what: 'Electricity and heat you buy', tone: '#0284c7' },
  3: { title: 'Scope 3', what: 'Travel, freight, waste, purchases, suppliers, commuting', tone: '#a16207' },
};
/** The GHG Protocol's names for the scope 3 categories the ledger uses. */
export const S3_NAMES: Record<number, string> = { 1: 'Purchased goods and services', 2: 'Capital goods', 4: 'Upstream transport', 5: 'Waste', 6: 'Business travel', 7: 'Employee commuting' };

export const tonnes = (kg: number) => `${(kg / 1000).toLocaleString(undefined, { maximumFractionDigits: kg >= 100_000 ? 0 : 2 })} t`;
export const kgText = (kg: number) => `${Math.round(kg).toLocaleString()} kg`;
export const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
export const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
export const unitText = (category: string) => { const c = categoryById(category); return c ? UNIT_LABEL[c.unit] : ''; };
export const catLabel = (category: string) => categoryById(category)?.label ?? category;
export const groups = () => {
  const out = new Map<string, typeof CATEGORIES>();
  for (const c of CATEGORIES) if (c.id !== 'supplier' && c.id !== 'commute') out.set(c.group, [...(out.get(c.group) ?? []), c]);
  return [...out];
};
const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(undefined, { type: 'region' }) : null;
export const countryName = (code: string) => { try { return regionNames?.of(code) ?? code; } catch { return code; } };
export const COUNTRIES = Object.keys(GRID).map((c) => ({ code: c, name: countryName(c) })).sort((a, b) => a.name.localeCompare(b.name));
export const MONTHS = (year: number) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
export const monthName = (period: string) => new Date(`${period}-15T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** What every section gets from the company page. */
export type SectionProps = { org: BizOrg; role: Role; year: number; overview: BizOverview; onChanged: () => void; onPick: (id: string) => void };
export const canEdit = (r: Role) => r !== 'viewer';
