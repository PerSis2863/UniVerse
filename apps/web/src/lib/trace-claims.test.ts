import { describe, expect, it } from 'vitest';
import { brandMoves, isOpen, ownerMayWithdraw, readTimeline } from './trace-claims';

describe('warranty claim steps', () => {
  it('lets the brand move a claim forward only', () => {
    expect(brandMoves('OPEN')).toEqual(['REVIEWING', 'APPROVED', 'REFUSED']);
    expect(brandMoves('APPROVED')).toEqual(['REPAIRED', 'REPLACED', 'REFUNDED']);
    expect(brandMoves('CLOSED')).toEqual([]);
    expect(brandMoves('WITHDRAWN')).toEqual([]);
  });
  it('lets the owner withdraw before a decision', () => {
    expect(ownerMayWithdraw('REVIEWING')).toBe(true);
    expect(ownerMayWithdraw('APPROVED')).toBe(false);
    expect(isOpen('REFUSED')).toBe(true);
    expect(isOpen('CLOSED')).toBe(false);
  });
  it('reads only sound timeline entries', () => {
    expect(readTimeline('[{"at":"2026-11-18","status":"OPEN","note":null,"by":"owner"},{"status":"NOPE"}]')).toHaveLength(1);
    expect(readTimeline('x')).toEqual([]);
  });
});
