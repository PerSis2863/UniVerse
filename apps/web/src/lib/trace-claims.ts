// Warranty claims (M309): the steps a claim goes through and who may take each. Shared by the server
// (src/server/trace-claims.ts), the brand's queue and the owner's vault.

export const CLAIM_STATUSES = ['OPEN', 'REVIEWING', 'APPROVED', 'REPAIRED', 'REPLACED', 'REFUNDED', 'REFUSED', 'WITHDRAWN', 'CLOSED'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_LABEL: Record<ClaimStatus, string> = {
  OPEN: 'Sent', REVIEWING: 'Being looked at', APPROVED: 'Approved', REPAIRED: 'Repaired', REPLACED: 'Replaced',
  REFUNDED: 'Refunded', REFUSED: 'Refused', WITHDRAWN: 'Withdrawn', CLOSED: 'Closed',
};

/** Where the brand may move a claim next. */
const BRAND_NEXT: Record<ClaimStatus, ClaimStatus[]> = {
  OPEN: ['REVIEWING', 'APPROVED', 'REFUSED'],
  REVIEWING: ['APPROVED', 'REFUSED'],
  APPROVED: ['REPAIRED', 'REPLACED', 'REFUNDED'],
  REPAIRED: ['CLOSED'], REPLACED: ['CLOSED'], REFUNDED: ['CLOSED'], REFUSED: ['CLOSED'],
  WITHDRAWN: [], CLOSED: [],
};

export const brandMoves = (s: ClaimStatus): ClaimStatus[] => BRAND_NEXT[s] ?? [];
/** The owner may withdraw until the brand has approved or refused. */
export const ownerMayWithdraw = (s: ClaimStatus) => s === 'OPEN' || s === 'REVIEWING';
export const isOpen = (s: string) => s !== 'CLOSED' && s !== 'WITHDRAWN';
export const isClaimStatus = (v: unknown): v is ClaimStatus => typeof v === 'string' && (CLAIM_STATUSES as readonly string[]).includes(v);

export type TimelineEntry = { at: string; status: ClaimStatus; note: string | null; by: 'owner' | 'brand' };
export function readTimeline(s: string): TimelineEntry[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v.filter((e) => e && isClaimStatus(e.status) && typeof e.at === 'string').slice(-50) : []; } catch { return []; }
}
