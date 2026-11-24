import { describe, expect, it } from 'vitest';
import { findInScripts, lineDiff } from './diff';

describe('Hyperion toolstrip: Compare and Find (M472)', () => {
  it('shows the lines kept, taken out and put in, in order', () => {
    const d = lineDiff('a\nb\nc\nd', 'a\nc\nd\ne');
    expect(d.map((l) => `${l.kind[0]}${l.text}`)).toEqual(['sa', 'gb', 'sc', 'sd', 'ne']);
    expect(d[2]).toMatchObject({ a: 3, b: 2 });
    expect(lineDiff('x', 'x')).toEqual([{ kind: 'same', text: 'x', a: 1, b: 1 }]);
  });
  it('finds a word in every script, whatever its case', () => {
    const hits = findInScripts([{ name: 'a.m', code: 'x = 1;\nPlot(x)' }, { name: 'b.py', code: 'plot(y)' }], 'plot');
    expect(hits.map((h) => `${h.name}:${h.line}`)).toEqual(['a.m:2', 'b.py:1']);
    expect(findInScripts([{ name: 'a', code: 'z' }], '  ')).toEqual([]);
  });
});
