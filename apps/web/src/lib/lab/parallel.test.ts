import { afterEach, describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { toMat } from './values';
import { classify, mergeSliced, parallel, runResumable, runTask } from './parallel-lab';
import { parse } from './parse';
import { mat } from './values';

const fakePool = (size: number) => { let tasks = 0; return { pool: { size, run: async (t: Parameters<typeof runTask>[0]) => { tasks++; return structuredClone(runTask(structuredClone(t))); } }, tasks: () => tasks }; };
const make = () => { let out = ''; const lab = new Lab({ out: (t) => { out += t; } }); return { lab, out: () => out, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
afterEach(() => { parallel.pool = null; parallel.wanted = 0; });

describe('Hyperion parallel computing (M477)', () => {
  it('sorts a parfor body’s variables', () => {
    const body = (parse('parfor i = 1:4\n t = i^2; y(i) = t; s = s + t; c = [c, i]; p = p * 2; A(:, i) = [i; t];\nend').body[0] as unknown as { body: never }).body;
    const k = classify(body, 'i');
    expect([...k.sliced].sort()).toEqual(['A', 'y']);
    expect(k.reductions.map((r) => `${r.name}${r.op}`)).toEqual(['s+', 'c,', 'p*']);
    expect([...k.temps]).toEqual(['t']);
  });
  it('merges the elements each worker changed', () => {
    const m = mergeSliced(mat(1, 2, [7, 7]), [mat(1, 3, [1, 7, 0]), mat(1, 4, [7, 7, 0, 4])]) as { r: number; c: number; d: Float64Array };
    expect([m.r, m.c, ...m.d]).toEqual([1, 4, 1, 7, 0, 4]);
  });
  it('runs a top-level parfor on the pool, the same answers as a for loop, then carries on', async () => {
    const f = fakePool(3);
    parallel.pool = f.pool;
    const code = "s = 0; c = []; names = {};\nparfor k = 1:10\n  t = k^2;\n  y(k) = t;\n  s = s + t;\n  c = [c, k];\n  names{k} = sprintf('n%d', k);\nend\ntotal = sum(y);\nafter = exist('t');";
    const par = make();
    await runResumable(par.lab, code);
    const ser = make();
    ser.lab.run(code.replace('parfor', 'for'));
    expect(par.d('y')).toEqual(ser.d('y'));
    expect(par.d('s')).toEqual([385]);
    expect(par.d('total')).toEqual([385]);
    expect(par.d('c')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect((par.lab.vars.get('names') as { d: { v: string }[] }).d.map((x) => x.v)).toEqual(Array.from({ length: 10 }, (_, i) => `n${i + 1}`));
    expect(par.d('after')).toEqual([0]); // the temporary is gone, as in MATLAB
    expect(f.tasks()).toBe(3);
    expect(par.out()).toMatch(/parfor: 10 iterations on 3 workers/);
  });
  it('runs a parfor inside a function in order, and parfeval with and without a pool', async () => {
    const a = make();
    a.lab.run('y = sq(5);\nfunction y = sq(n)\n  parfor i = 1:n\n    y(i) = i^2;\n  end\nend');
    expect(a.d('y')).toEqual([1, 4, 9, 16, 25]);
    const b = make();
    b.lab.run('F = parfeval(@(x) x * 2, 1, 21); v = fetchOutputs(F);');
    expect(b.d('v')).toEqual([42]);
    parallel.pool = fakePool(2).pool;
    const c = make();
    await runResumable(c.lab, "for k = 1:3, F(k) = parfeval(@(x) [x x^2], 1, k); end\nfor k = 1:3\n  [i, v] = fetchNext(F);\n  got(i, :) = v;\nend\nall = fetchOutputs(F);");
    expect(c.d('got')).toEqual([1, 2, 3, 1, 4, 9]);
    expect(c.d('all')).toEqual([1, 2, 3, 1, 4, 9]);
  });
});
