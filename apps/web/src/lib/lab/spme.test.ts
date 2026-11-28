import { describe, expect, it } from 'vitest';
import { groupsOf, LGM50, ocpNeg, ocpPos, spmeCapacity, spmeSim, withGroups } from './spme';

describe('the single particle model with electrolyte (M572)', () => {
  it("Chen et al.'s LG M50: about 5 Ah, 4.17 V full and its open-circuit potentials", () => {
    expect(spmeCapacity(LGM50)).toBeGreaterThan(4.8);
    expect(spmeCapacity(LGM50)).toBeLessThan(5.3);
    expect(ocpPos(LGM50.y100) - ocpNeg(LGM50.x100)).toBeCloseTo(4.17, 1);
    expect(ocpPos(LGM50.y0) - ocpNeg(LGM50.x0)).toBeLessThan(3.0);
  });
  it('a 1C discharge runs about an hour; faster discharges give less and sag more', () => {
    const cap = spmeCapacity(LGM50), run = (c: number) => spmeSim(LGM50, new Array(7200).fill(c * cap), 1, 1, { keepCe: 600 });
    const one = run(1), two = run(2);
    expect(one.v.length).toBeGreaterThan(3200);
    expect(one.v.length).toBeLessThan(3700);
    expect(two.v.length * 2).toBeLessThan(one.v.length);
    expect(two.v[600]).toBeLessThan(one.v[600]);
    // The electrolyte: richer at the negative end while discharging.
    const ce = one.ce[2];
    expect(ce[0]).toBeGreaterThan(ce[ce.length - 1]);
  });
  it('rests back towards the open-circuit voltage', () => {
    const cap = spmeCapacity(LGM50), I = [...new Array(600).fill(cap), ...new Array(12000).fill(0)], r = spmeSim(LGM50, I, 1, 0.8); // the positive particle's R²/D is ~6,800 s
    // The lithium the negative particle gave up is what the positive took in (Chen's electrodes aren't balanced exactly).
    const P = LGM50, x = P.x0 + r.soc.at(-1)! * (P.x100 - P.x0), xs = P.x0 + 0.8 * (P.x100 - P.x0);
    const y = P.y0 + 0.8 * (P.y100 - P.y0) + ((xs - x) * P.epsSn * P.Ln * P.cnMax) / (P.epsSp * P.Lp * P.cpMax), ocv = ocpPos(y) - ocpNeg(x);
    expect(Math.abs(r.v.at(-1)! - ocv)).toBeLessThan(0.01);
    expect(r.v[599]).toBeLessThan(r.v.at(-1)!);
  });
  it('grouped parameters change what they should', () => {
    const g = groupsOf(LGM50), slow = withGroups(LGM50, { ...g, tauN: g.tauN * 5 });
    const I = new Array(600).fill(spmeCapacity(LGM50)), a = spmeSim(slow, I, 1, 0.7).v, b = spmeSim(LGM50, I, 1, 0.7).v;
    expect(a.length).toBe(600);
    expect(a[599]).toBeLessThan(b[599]);
  });
});

import { spmeFit } from './spme';
describe('grouped parameter estimation (M572)', () => {
  it('finds the diffusion time, reaction scale and contact resistance from pulses', () => {
    const cap = spmeCapacity(LGM50), I: number[] = [];
    for (let k = 0; k < 4; k++) I.push(...new Array(60).fill(2 * cap), ...new Array(240).fill(0), ...new Array(60).fill(-cap), ...new Array(240).fill(0));
    const truthG = { ...groupsOf(LGM50), tauN: groupsOf(LGM50).tauN * 3, kScale: 0.5, rContact: 0.02 };
    const v = spmeSim(withGroups(LGM50, truthG), I, 1, 0.6).v;
    const f = spmeFit(LGM50, I, v, 1, 0.6, ['tauN', 'kScale', 'rContact']);
    expect(f.rms).toBeLessThan(1e-3);
    expect(f.groups.rContact).toBeCloseTo(0.02, 3);
    expect(f.groups.tauN / truthG.tauN).toBeGreaterThan(0.8);
    expect(f.groups.tauN / truthG.tauN).toBeLessThan(1.25);
    expect(f.groups.kScale).toBeCloseTo(0.5, 1);
  });
});

import { Lab } from './interp';
import { Graphics } from './plot';
import { FileStore } from './files';
import { toMat } from './values';
import './battsys-lab';
describe('electrochemical cells in the language (M572)', () => {
  it('a cell, a discharge with its plots, and a fit', () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics(), files: new FileStore() });
    lab.run(`c = spmeCell(); cap = c.Capacity;
[v, z] = spmeSimulate(c, cap*ones(1, 1800), 1, 1); last = v(end); zz = z(end);
spmeSimulate(c, 2*cap*ones(1, 3600), 1, 1);
t = spmeCell('rContact', 0.03); I = [2*cap*ones(1, 60) zeros(1, 240)]; m = spmeSimulate(t, I, 1, 0.6);
f = spmeFit(c, I, m, 1, 0.6, 'Fit', {'rContact'}); r = f.Groups.rContact;`);
    const g = (k: string) => toMat(lab.vars.get(k)!).d[0];
    expect(g('zz')).toBeCloseTo(0.5, 1);
    expect(g('last')).toBeGreaterThan(3.4);
    expect(g('r')).toBeCloseTo(0.03, 3);
    expect(() => lab.run("spmeCell('x0', 0.95)")).toThrow(/stoichiometries/);
  });
});
