import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { toMat } from './values';
import './gpu-lab';

// M478: without a graphics chip (as in tests) gpuArray runs on the CPU, with the same answers as plain matrices.
describe('Hyperion GPU computing (M478)', () => {
  it('computes on gpuArrays and gathers the same numbers as on the CPU', () => {
    let out = '';
    const lab = new Lab({ out: (t) => { out += t; } });
    lab.run(`A = magic(4); B = reshape(1:12, 4, 3);
      G = gpuArray(A); H = gpuArray(B);
      c1 = gather(G*H); c2 = A*B;
      e1 = gather(exp(G/10) + 2*G - G.^2 ./ 3); e2 = exp(A/10) + 2*A - A.^2 ./ 3;
      s1 = gather(sum(G)); s2 = sum(A); t1 = gather(transpose(H)); t2 = B';
      k = class(G); sz = size(H); n = numel(H); g = isgpuarray(G); d = gpuDeviceCount;
      G`);
    const v = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(v('c1')).toEqual(v('c2'));
    v('e1').forEach((x, i) => expect(x).toBeCloseTo(v('e2')[i], 10));
    expect(v('s1')).toEqual(v('s2'));
    expect(v('t1')).toEqual(v('t2'));
    expect((lab.vars.get('k') as { v: string }).v).toBe('gpuArray');
    expect(v('sz')).toEqual([4, 3]);
    expect(v('n')).toEqual([12]);
    expect(v('g')).toEqual([1]);
    expect(v('d')).toEqual([0]);
    expect(out).toContain('4×4 gpuArray (no GPU here: on the CPU)');
    expect(() => lab.run('x = G * H * ones(2)')).toThrow(/inner sizes/);
    expect(() => lab.run('x = G < 3')).toThrow(/gather it first/);
  });
});
