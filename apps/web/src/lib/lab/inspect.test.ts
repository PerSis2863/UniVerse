import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { resolve, view } from './inspect';
import './files';

const lab = new Lab({ out: () => {} });
lab.run("A = reshape(1:24, 2, 3, 4); s.name = 'Ada'; s.m = magic(3); c = {1, [1 2 3]; 'x', s}; T = table([1; 2], {'a'; 'b'}, 'VariableNames', {'n', 'tag'}); B = zeros(300, 50);");
const at = (name: string) => lab.vars.get(name)!;

describe('Hyperion: the variable viewer (M390)', () => {
  it('shows a page of a 3D array with figures about it', () => {
    const v = view(at('A'), 2);
    expect(v.kind === 'grid' && [v.page, v.cells, v.stats.map(([k]) => k)]).toEqual([2, [['13', '15', '17'], ['14', '16', '18']], ['Min', 'Max', 'Mean']]);
  });
  it('shows a window of a big matrix', () => {
    const v = view(at('B'), 0, [250, 30]);
    expect(v.kind === 'grid' && [v.from, v.cells.length, v.cells[0].length]).toEqual([[250, 30], 50, 20]);
  });
  it('opens fields, cell items and table columns by path', () => {
    expect(view(at('s')).kind).toBe('fields');
    const deep = resolve(at('c'), 'c', [{ item: [1, 1] }, { field: 'm' }]);
    expect(deep.expr).toBe('c{2,2}.m');
    expect(view(deep.value).kind).toBe('grid');
    const t = view(at('T'));
    expect(t.kind === 'table' && [t.names, t.rows]).toEqual([['n', 'tag'], [['1', 'a'], ['2', 'b']]]);
    expect(() => resolve(at('s'), 's', [{ field: 'nope' }])).toThrow(/no nope/);
  });
});
