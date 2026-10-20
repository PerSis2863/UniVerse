// Global impact (Stage 5 · Q16): the rules shared by the server, the pages and the tests. Donation
// amounts and Indian tax details (80G receipts), and the volunteering milestones.

// ── Donations ──────────────────────────────────────────────────────────
export const DONATION_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;
export type DonationCurrency = (typeof DONATION_CURRENCIES)[number];
export const isDonationCurrency = (v: unknown): v is DonationCurrency => typeof v === 'string' && (DONATION_CURRENCIES as readonly string[]).includes(v);
/** Smallest and largest gift, in whole units (₹10 to ₹5,00,000; 1 to 10,000 in the others). */
export const DONATION_LIMITS: Record<DonationCurrency, [number, number]> = { INR: [10, 500_000], USD: [1, 10_000], EUR: [1, 10_000], GBP: [1, 10_000] };
export const DONATION_PRESETS: Record<DonationCurrency, number[]> = { INR: [100, 500, 1000, 2500], USD: [5, 10, 25, 50], EUR: [5, 10, 25, 50], GBP: [5, 10, 25, 50] };

/** A gift in whole units (up to 2 decimals) as minor units, or null when outside the limits. */
export function donationMinor(raw: unknown, currency: DonationCurrency): number | null {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) return null;
  const [min, max] = DONATION_LIMITS[currency];
  if (n < min || n > max) return null;
  return Math.round(n * 100);
}

/** An Indian PAN (5 letters, 4 digits, 1 letter), upper-cased, or null. */
export function cleanPan(raw: unknown): string | null {
  const v = typeof raw === 'string' ? raw.replace(/\s+/g, '').toUpperCase() : '';
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v) ? v : null;
}

/** An 80G registration (approval) number as printed on the NGO's certificate: letters, digits, / and -. */
export function cleanReg80G(raw: unknown): string | null {
  const v = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return /^[A-Z0-9][A-Z0-9/\-. ]{5,59}$/.test(v) ? v : null;
}

/** An 80G receipt needs an Indian rupee gift to an NGO with its 80G number and PAN. */
export const offers80G = (currency: string, ngo: { reg80G: string | null; pan: string | null }) => currency === 'INR' && !!ngo.reg80G && !!ngo.pan;

export const receiptLabel = (n: number) => `D-${String(n).padStart(6, '0')}`;

// ── Volunteering milestones ────────────────────────────────────────────
export const MILESTONES = [10, 50, 100] as const;
/** The milestone certificates due: reached and not issued yet. */
export const milestonesDue = (hours: number, issued: number[]) => MILESTONES.filter((m) => hours >= m && !issued.includes(m));
