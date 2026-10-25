import type { AppId } from './apps';

// The Impact Wallet on /hub (src/server/impact-wallet.ts): what a person holds in every app (impact
// points, Trace points, people helped, CO₂ saved) with one history across them. Each balance keeps
// its own unit: they are never added into one made-up score.

export const WALLET_WEEKS = 12;
const WEEK = 7 * 86_400_000;

/** Sums values into weekly buckets, oldest first, the last one ending now. */
export function weekly(rows: { at: number; v: number }[], now: number, weeks = WALLET_WEEKS) {
  const out = Array.from({ length: weeks }, () => 0);
  for (const r of rows) {
    const back = Math.floor((now - r.at) / WEEK);
    if (back >= 0 && back < weeks) out[weeks - 1 - back] += r.v;
  }
  return out.map((v) => Math.round(v * 10) / 10);
}

export interface WalletEvent { app: AppId; at: string; text: string; amount: string }

/** The newest events across every app. */
export const newest = (events: WalletEvent[], n = 30) => [...events].sort((a, b) => b.at.localeCompare(a.at)).slice(0, n);

/** Trace points' worth, one line per currency (brands set their own point value). */
export function worth(balances: { points: number; pointValue: number; currency: string }[]) {
  const by = new Map<string, number>();
  for (const b of balances) if (b.points > 0) by.set(b.currency, (by.get(b.currency) ?? 0) + b.points * b.pointValue);
  return [...by].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount);
}
