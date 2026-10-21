import { describe, expect, it } from 'vitest';
import { inParts, partsOf } from './d1-parts';

describe('queries in parts of 90 (D1 takes 100 values)', () => {
  it('cuts a list into parts', () => {
    expect(partsOf(Array.from({ length: 200 }, (_, i) => i)).map((p) => p.length)).toEqual([90, 90, 20]);
    expect(partsOf([])).toEqual([]);
  });
  it('runs each part and joins the rows', async () => {
    const seen: number[] = [];
    const rows = await inParts(Array.from({ length: 185 }, (_, i) => i), async (part) => { seen.push(part.length); return part.filter((x) => x % 50 === 0); });
    expect(seen).toEqual([90, 90, 5]);
    expect(rows).toEqual([0, 50, 100, 150]);
    expect(await inParts([], async () => [1])).toEqual([]);
  });
});
