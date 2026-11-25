import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as ch from './chem';
import * as cp from './chem-plus';
import { ELEMENTS } from './elements';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

describe('Hyperion chemistry, the left-outs (M513)', () => {
  it('reads formulas and gives molar masses', () => {
    expect(ELEMENTS).toHaveLength(118);
    expect(ELEMENTS[25].symbol).toBe('Fe');
    expect(ELEMENTS[79].symbol).toBe('Hg');
    expect(ELEMENTS[117].symbol).toBe('Og');
    expect(cp.molarMass('C6H12O6')).toBeCloseTo(180.156, 3);
    expect(cp.molarMass('CuSO4·5H2O')).toBeCloseTo(249.677, 3);
    expect(cp.molarMass('CuSO4*5H2O')).toBeCloseTo(249.677, 3);
    expect(cp.molarMass('K4[Fe(CN)6]')).toBeCloseTo(368.345, 3);
    expect(cp.molarMass('Ca(OH)2')).toBeCloseTo(74.092, 3);
    expect(cp.parseFormula('SO4^2-').charge).toBe(-2);
    expect(cp.parseFormula('Fe^{3+}').charge).toBe(3);
    expect(cp.parseFormula('NH4+').charge).toBe(1);
    expect(() => cp.parseFormula('Xq2')).toThrow();
    expect(() => cp.parseFormula('Ca(OH2')).toThrow();
  });
  it('balances equations, ionic ones by their charge too', () => {
    expect(cp.balance('C3H8 + O2 -> CO2 + H2O').coef).toEqual([1, 5, 3, 4]);
    expect(cp.balance('KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2').coef).toEqual([2, 16, 2, 2, 8, 5]);
    expect(cp.balance('MnO4^- + Fe^2+ + H+ -> Mn^2+ + Fe^3+ + H2O').coef).toEqual([1, 5, 8, 1, 5, 4]);
    expect(() => cp.balance('H2O -> CO2')).toThrow();
  });
  it('acids with several protons, bases, buffers and activities', () => {
    // 0.1 M phosphoric acid: the first proton rules, x²/(0.1 − x) = Ka1.
    const Ka1 = 7.1e-3, x = (-Ka1 + Math.sqrt(Ka1 * Ka1 + 4 * Ka1 * 0.1)) / 2;
    expect(cp.solvePH({ acids: [{ Ka: [Ka1, 6.3e-8, 4.5e-13], C: 0.1, charge: 0 }], cation: 0, anion: 0 }).pH).toBeCloseTo(-Math.log10(x), 3);
    // 0.1 M ammonia (NH4⁺'s Ka 5.6e-10): [OH⁻] ≈ √(Kb C).
    expect(cp.solvePH({ acids: [{ Ka: [5.6e-10], C: 0.1, charge: 1 }], cation: 0, anion: 0 }).pH).toBeCloseTo(14 + Math.log10(Math.sqrt((1e-14 / 5.6e-10) * 0.1)), 2);
    // Equal acetic acid and acetate: pH = pKa; with Davies' activities lower by −log γ(I ≈ 0.1).
    const buf = { acids: [{ Ka: [1.8e-5], C: 0.2, charge: 0 }], cation: 0.1, anion: 0 };
    expect(cp.solvePH(buf).pH).toBeCloseTo(-Math.log10(1.8e-5), 3);
    const act = cp.solvePH(buf, { activity: true });
    expect(act.I).toBeCloseTo(0.1, 3);
    expect(act.pH).toBeCloseTo(-Math.log10(1.8e-5) + Math.log10(cp.davies(1, act.I)), 3);
    expect(cp.davies(1, 0.1)).toBeCloseTo(0.7816, 3);
    // Fractions sum to 1 and cross at each pKa.
    const f = cp.fractions([1e-3, 1e-7], 1e-3);
    expect(f[0]).toBeCloseTo(f[1], 3);
    expect(f.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
  });
  it('titrates acetic acid with NaOH: pKa half way, 8.72 at equivalence', () => {
    const r = cp.titration({ Ka: [1.8e-5], C: 0.1, charge: 0 }, 25, 0.1, 'base', [12.5, 25]);
    expect(r.equivalence).toEqual([25]);
    expect(r.pH[0]).toBeCloseTo(-Math.log10(1.8e-5), 2);
    expect(r.pH[1]).toBeCloseTo(8.72, 2);
    // Phosphoric acid has two equivalence points a strong base reaches in water's range, three listed.
    expect(cp.titration({ Ka: [7.1e-3, 6.3e-8, 4.5e-13], C: 0.1, charge: 0 }, 10, 0.1, 'base', [0]).equivalence.map((v) => +v.toFixed(9))).toEqual([10, 20, 30]);
    expect(cp.titration({ Ka: [5.6e-10], C: 0.1, charge: 1 }, 10, 0.05, 'acid', [0]).equivalence).toEqual([20]);
  });
  it('a batch that heats itself up, adiabatic, reaches T0 + ΔT_ad', () => {
    const m = ch.parseMechanism('A -> B'), h: cp.Heat = { A: [1e6], Ea: [50e3], dH: [-50e3], rhoCp: 4180, UA: 0, Tc: 300 };
    const r = cp.heatedBatch(m, h, [2, 0], 300, 2000), y = r.y[r.y.length - 1];
    expect(y[0]).toBeLessThan(1e-6);
    expect(y[2]).toBeCloseTo(300 + (2 * 50e3) / 4180, 4);
    // Cooling brings it back to the coolant.
    const c = cp.heatedBatch(m, { ...h, UA: 50 }, [2, 0], 300, 20000);
    expect(c.y[c.y.length - 1][2]).toBeCloseTo(300, 3);
  });
  it('finds three steady states of an exothermic CSTR, the middle unstable', () => {
    const m = ch.parseMechanism('A -> B'), Ea = 7500 * ch.R_GAS, A = 1e10, tau = (0.05 * Math.exp(25)) / A;
    const h: cp.Heat = { A: [A], Ea: [Ea], dH: [-209e3], rhoCp: 4180, UA: 0, Tc: 300 };
    const r = cp.cstrSteadyStates(m, h, [2, 0], 300, tau, [290, 420]);
    expect(r.states.map((s) => s.stable)).toEqual([true, false, true]);
    for (const s of r.states) {
      const k = ch.arrhenius(A, Ea, s.T);
      expect(s.c[0]).toBeCloseTo(2 / (1 + k * tau), 8);
      expect(s.T - 300).toBeCloseTo(100 * (1 - s.c[0] / 2), 6);
    }
  });
  it('in the language', () => {
    const r = run("M = molarMass({'H2O', 'NaCl'}); [c, txt] = balanceEquation('Fe + O2 -> Fe2O3');\npH = polyproticPH([7.1e-3 6.3e-8 4.5e-13], 0.1); b = bufferPH(1.8e-5, 0.1, 0.1);\n[V, p, eq] = titrationCurve(1.8e-5, 0.1, 25, 0.1); g = activityCoeff([1 2], 0.1); I = ionicStrength([0.1 0.1], [1 -1]);\ne = elementInfo('iron'); w = e.Weight;\ntitrationCurve([7.1e-3 6.3e-8 4.5e-13], 0.1, 10, 0.1)\nfigure; heatedBatch('A -> B', 1e6, 50e3, -50e3, [2 0], 300, 2000)\nfigure; cstrSteadyStates('A -> B', 1e10, 7500*8.314462618, -209e3, [2 0], 300, 0.05*exp(25)/1e10)\nfigure; acidSpecies([7.1e-3 6.3e-8 4.5e-13])");
    expect(r.d('M')[0]).toBeCloseTo(18.015, 3);
    expect(r.d('c')).toEqual([4, 3, 2]);
    expect(r.d('b')[0]).toBeCloseTo(4.745, 2);
    expect(r.d('eq')).toEqual([25]);
    expect(r.d('I')[0]).toBeCloseTo(0.1, 12);
    expect(r.d('w')[0]).toBe(55.845);
    expect(r.out).toContain('unstable');
    expect(r.graphics.figures.length).toBe(4);
  });
});
