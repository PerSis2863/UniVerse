import { describe, expect, it } from 'vitest';
import { guideTopUp } from './guide-fill';

type S = Parameters<typeof guideTopUp>[0][number];
const fresh: S[] = [
  { id: 'g-box', type: 'rectangle', version: 1, boundElements: [{ id: 'label-new', type: 'text' }] },
  { id: 'label-new', type: 'text', version: 1, containerId: 'g-box' },
  { id: 'g-note', type: 'text', version: 1 },
  { id: 'g-gone', type: 'rectangle', version: 1 },
];

describe('guideTopUp', () => {
  it('adds what never arrived and keeps deletions', () => {
    const board: S[] = [{ id: 'g-gone', type: 'rectangle', version: 3, isDeleted: true }];
    expect(guideTopUp(board, fresh)?.map((e) => e.id)).toEqual(['g-gone', 'g-box', 'label-new', 'g-note']);
  });

  it('replaces a box whose label never arrived with a newer copy', () => {
    const board: S[] = [
      { id: 'g-box', type: 'rectangle', version: 5, boundElements: [{ id: 'label-old', type: 'text' }] },
      { id: 'g-note', type: 'text', version: 1 },
      { id: 'g-gone', type: 'rectangle', version: 1 },
    ];
    const out = guideTopUp(board, fresh)!;
    expect(out.find((e) => e.id === 'g-box')).toMatchObject({ version: 6, boundElements: [{ id: 'label-new' }] });
    expect(out.map((e) => e.id)).toContain('label-new');
  });

  it('leaves a complete board alone', () => {
    const board: S[] = [
      { id: 'g-box', type: 'rectangle', version: 2, boundElements: [{ id: 'label-x', type: 'text' }] },
      { id: 'label-x', type: 'text', version: 1, containerId: 'g-box' },
      { id: 'g-note', type: 'text', version: 1 },
      { id: 'g-gone', type: 'rectangle', version: 1 },
    ];
    expect(guideTopUp(board, fresh)).toBeNull();
  });
});
