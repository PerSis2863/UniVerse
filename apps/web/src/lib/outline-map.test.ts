import { describe, expect, it } from 'vitest';
import { outlineToMap } from './outline-map';

describe('outline to mind map', () => {
  it('reads an indented outline', () => {
    expect(outlineToMap('Photosynthesis\n  Inputs\n    Light\n    Water\n      deep detail\n  Outputs\n    Oxygen')).toEqual({
      center: 'Photosynthesis',
      branches: [{ label: 'Inputs', ideas: ['Light', 'Water', 'deep detail'] }, { label: 'Outputs', ideas: ['Oxygen'] }],
    });
  });

  it('reads bullets and a flat list', () => {
    expect(outlineToMap('Trip\n- Food\n- Tickets\n\n- Hotel')).toEqual({ center: 'Trip', branches: [{ label: 'Food', ideas: [] }, { label: 'Tickets', ideas: [] }, { label: 'Hotel', ideas: [] }] });
    expect(outlineToMap('   \n')).toBeNull();
  });

  it('caps branches and ideas', () => {
    const m = outlineToMap(['Big', ...Array.from({ length: 20 }, (_, i) => `- B${i}`)].join('\n'), 5)!;
    expect(m.branches).toHaveLength(5);
  });
});
