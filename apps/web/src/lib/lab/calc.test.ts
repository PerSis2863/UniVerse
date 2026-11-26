import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './calc-lab';

const run = (code: string) => { const lab = new Lab({ out: () => {}, graphics: new Graphics() }); lab.run(code); return lab; };
const val = (lab: Lab, name: string) => [...toMat(lab.vars.get(name)!).d];

describe('Hyperion: integral2, integral3, pdepe (M553)', () => {
  it('integral2 over a box and over a region with function limits', () => {
    const lab = run('a = integral2(@(x, y) x.*y.^2, 0, 2, 0, 3); b = integral2(@(x, y) ones(size(x)), 0, 1, 0, @(x) x); c = integral2(@(x, y) exp(-(x.^2 + y.^2)), -6, 6, -6, 6);');
    expect(val(lab, 'a')![0]).toBeCloseTo(18, 9);
    expect(val(lab, 'b')![0]).toBeCloseTo(0.5, 9);
    expect(val(lab, 'c')![0]).toBeCloseTo(Math.PI, 8);
  });
  it('integral3: a box and the unit sphere’s volume', () => {
    const lab = run('a = integral3(@(x, y, z) x + y + z, 0, 1, 0, 1, 0, 1); v = integral3(@(x, y, z) 1, -1, 1, @(x) -sqrt(1 - x.^2), @(x) sqrt(1 - x.^2), @(x, y) -sqrt(max(0, 1 - x.^2 - y.^2)), @(x, y) sqrt(max(0, 1 - x.^2 - y.^2)));');
    expect(val(lab, 'a')![0]).toBeCloseTo(1.5, 6);
    expect(val(lab, 'v')![0]).toBeCloseTo((4 / 3) * Math.PI, 3);
  });
  it('pdepe: heat in a rod, ends held at 0, decays as sin(πx)·e^(−π²t)', () => {
    const lab = run(`
      function [c, f, s] = pde(x, t, u, dudx)
        c = 1; f = dudx; s = 0;
      end
      function u0 = ic(x)
        u0 = sin(pi*x);
      end
      function [pl, ql, pr, qr] = bc(xl, ul, xr, ur, t)
        pl = ul; ql = 0; pr = ur; qr = 0;
      end
      x = linspace(0, 1, 41); t = [0 0.05 0.1];
      sol = pdepe(0, @pde, @ic, @bc, x, t);
      mid = sol(3, 21);`);
    expect(val(lab, 'mid')![0]).toBeCloseTo(Math.exp(-Math.PI * Math.PI * 0.1), 2);
  });
  it('pdepe: a flux end (insulated) keeps the heat in', () => {
    const lab = run(`
      function [c, f, s] = pde(x, t, u, dudx)
        c = 1; f = dudx; s = 0;
      end
      function u0 = ic(x)
        u0 = 1 + cos(pi*x);
      end
      function [pl, ql, pr, qr] = bc(xl, ul, xr, ur, t)
        pl = 0; ql = 1; pr = 0; qr = 1;
      end
      x = linspace(0, 1, 41); t = [0 0.5];
      sol = pdepe(0, @pde, @ic, @bc, x, t);
      avg = trapz(x, sol(2, :));`);
    expect(val(lab, 'avg')![0]).toBeCloseTo(1, 3);
  });
});
