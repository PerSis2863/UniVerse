import { describe, expect, it } from 'vitest';
import { cleanPins, parsePins, MAX_PINS } from './collab-pins';

describe('collab pins', () => {
  it('keeps well-formed pins once each', () => {
    const pins = cleanPins({ pins: [
      { kind: 'doc', id: 'a1', title: '  Lab report ', href: '/docs/a1' },
      { kind: 'doc', id: 'a1', title: 'Again', href: '/docs/a1' },
      { kind: 'board', id: 'b1', title: '', href: '/boards/b1' },
    ] });
    expect(pins).toEqual([{ kind: 'doc', id: 'a1', title: 'Lab report', href: '/docs/a1' }, { kind: 'board', id: 'b1', title: 'Untitled', href: '/boards/b1' }]);
  });

  it('drops links that leave the app and unknown kinds', () => {
    expect(cleanPins([
      { kind: 'doc', id: 'x', title: 'Evil', href: '//evil.example' },
      { kind: 'doc', id: 'y', title: 'Evil', href: 'https://evil.example' },
      { kind: 'doc', id: 'z', title: 'Script', href: '/docs/z"><script>' },
      { kind: 'video', id: 'v', title: 'No', href: '/v' },
    ])).toEqual([]);
  });

  it('caps the list and survives bad JSON', () => {
    expect(cleanPins(Array.from({ length: 40 }, (_, i) => ({ kind: 'tasks', id: `t${i}`, title: 'T', href: `/tasks/t${i}` }))).length).toBe(MAX_PINS);
    expect(parsePins('{oops')).toEqual([]);
  });
});
