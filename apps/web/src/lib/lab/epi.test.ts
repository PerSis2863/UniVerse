import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as ep from './epi';
import { rk45, ros23 } from './sci-num';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

describe('the shared solvers (M492)', () => {
  it('rk45 solves y\' = −y and ros23 a stiff problem (Robertson-like decay)', () => {
    const r = rk45((_, [y]) => [-y], 0, 5, [1]);
    expect(r.y[r.y.length - 1][0]).toBeCloseTo(Math.exp(-5), 7);
    // y1' = −1000 y1 + y2, y2' = −y2: y2 = e^−t, y1 → e^−t / 999 after the fast part.
    const s = ros23((_, [a, b]) => [-1000 * a + b, -b], 0, 2, [1, 1], 1e-5, 1e-9);
    const end = s.y[s.y.length - 1];
    expect(end[1]).toBeCloseTo(Math.exp(-2), 4);
    expect(end[0]).toBeCloseTo(Math.exp(-2) / 999, 6);
    expect(s.steps).toBeLessThan(400);
  });
});

describe('Hyperion epidemics (M492)', () => {
  it('SIR keeps the population, peaks when S = N / R0 and ends at the final-size answer', () => {
    const N = 1e6, r = ep.sir(0.3, 0.1, [N - 10, 10, 0], 400);
    r.y.forEach((s) => expect(s[0] + s[1] + s[2]).toBeCloseTo(N, 3));
    const I = r.y.map((s) => s[1]), k = I.indexOf(Math.max(...I));
    expect(Math.abs(r.y[k][0] / N - 1 / 3)).toBeLessThan(0.02); // a day apart near the peak
    // R0 = 3: z = 1 − e^(−3z) has z = 0.9405.
    expect(ep.finalSize(3)).toBeCloseTo(0.9405, 4);
    expect(r.y[r.y.length - 1][2] / N).toBeCloseTo(ep.finalSize(3), 3);
    expect(ep.finalSize(2)).toBeCloseTo(0.7968, 4);
    expect(ep.herdImmunity(4)).toBe(0.75);
    // Daily new infections add up to everyone who left S.
    expect(r.incidence.reduce((s, x) => s + x, 0)).toBeCloseTo(N - 10 - r.y[r.y.length - 1][0], 2);
  });
  it('a lockdown and vaccination make the outbreak smaller', () => {
    const N = 1e5, plain = ep.sir(0.3, 0.1, [N - 10, 10, 0], 300), lock = ep.sir(0.3, 0.1, [N - 10, 10, 0], 300, { interventions: [{ from: 30, to: 90, cut: 0.6 }] });
    const vax = ep.sir(0.3, 0.1, [N - 10, 10, 0], 300, { vaccinate: 0.01 });
    const peak = (r: ep.EpiRun) => Math.max(...r.y.map((s) => s[1]));
    expect(peak(lock)).toBeLessThan(peak(plain));
    expect(vax.incidence.reduce((s, x) => s + x, 0)).toBeLessThan(plain.incidence.reduce((s, x) => s + x, 0) * 0.8);
    // SEIR has the same final size as SIR with the same R0, later.
    const se = ep.seir(0.3, 0.2, 0.1, [N - 10, 0, 10, 0], 600);
    expect(se.y[se.y.length - 1][3] / N).toBeCloseTo(ep.finalSize(3), 2);
  });
  it('age groups: R0 from the next-generation matrix', () => {
    // Everyone mixes alike: R0 = β Σ_j C_ij / γ.
    expect(ep.r0(0.05, 0.2, [[3, 3], [3, 3]], [500, 500])).toBeCloseTo((0.05 * 6) / 0.2, 9);
    // Two groups that never meet: the larger group R0.
    expect(ep.r0(0.1, 0.25, [[10, 0], [0, 2]], [100, 900])).toBeCloseTo(4, 9);
    const r = ep.sirAge(0.05, [[8, 2], [2, 4]], 0.2, [3000, 7000], [5, 5], 200);
    const sum = r.y[r.y.length - 1].reduce((s, x) => s + x, 0);
    expect(sum).toBeCloseTo(10000, 3);
  });
  it('fits β and γ back from cases made by the model', () => {
    const N = 5e5, made = ep.sir(0.32, 0.12, [N - 20, 20, 0], 120).incidence;
    const f = ep.fitEpidemic(made.map(Math.round), N);
    expect(f.r0).toBeCloseTo(0.32 / 0.12, 1);
    expect(Math.abs(f.beta / 0.32 - 1)).toBeLessThan(0.05);
    const se = ep.fitEpidemic(ep.seir(0.45, 0.2, 0.15, [1e6 - 20, 0, 20, 0], 80).incidence.map(Math.round), 1e6, 'SEIR', { sigma: 0.2 });
    expect(se.r0).toBeCloseTo(3, 1);
  });
  it('R_t from cases growing at a known rate', () => {
    // Cases growing by r a day with a serial interval of exactly 1 day have R = e^r; a gamma with a tiny sd ≈ that.
    const cases = Array.from({ length: 60 }, (_, t) => Math.round(50 * Math.exp(0.05 * t)));
    const r = ep.rt(cases, 1, 0.05, 7);
    expect(r.r[50]).toBeCloseTo(Math.exp(0.05), 1);
    expect(ep.serialWeights(5, 2).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    expect(ep.lgamma(5)).toBeCloseTo(Math.log(24), 12);
  });
  it('in the language', () => {
    const r = run("[t, y, n] = sir(0.3, 0.1, [999990 10 0], 200); R0 = epiR0(0.3, 0.1); z = epiFinalSize([2 3]); h = herdImmunity(R0);\nsir(0.3, 0.1, [999990 10 0], 200, 'Intervention', [20 60 0.5])\nf = fitEpidemic(n(1:120), 1e6); b = f.Beta;");
    expect(r.d('R0')[0]).toBeCloseTo(3, 12);
    expect(r.d('z')[1]).toBeCloseTo(0.9405, 4);
    expect(r.d('t').length).toBe(201);
    expect(r.d('b')[0]).toBeGreaterThan(0.27);
    expect(r.graphics.figures.length).toBeGreaterThan(0);
  });
});

describe('Hyperion epidemics, the left-outs (M510)', () => {
  let seed = 7;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  it('Gillespie: about 1/R0 of single-case outbreaks die out, the rest reach the final size, nobody is lost', () => {
    const runs = Array.from({ length: 400 }, () => ep.sirGillespie(0.2, 0.1, [999, 1, 0], 400, rand));
    runs.forEach((r) => r.y.forEach(([S, I, R]) => expect(S + I + R).toBe(1000)));
    const ever = runs.map((r) => 1000 - r.y[r.y.length - 1][0]), big = ever.filter((x) => x > 100);
    expect(Math.abs(1 - big.length / 400 - 0.5)).toBeLessThan(0.08);
    expect(Math.abs(big.reduce((s, x) => s + x, 0) / big.length / 1000 - ep.finalSize(2))).toBeLessThan(0.03);
  });
  it('SEIHRD: no hospital is SEIR; everyone kept; too few beds means more deaths', () => {
    const y0 = [1e5 - 10, 0, 10, 0, 0, 0], plain = ep.seir(0.4, 0.2, 0.15, [1e5 - 10, 0, 10, 0], 200);
    const none = ep.seihrd(0.4, 0.2, 0.15, y0, 200, { hospital: 0 });
    expect(none.y[150][2]).toBeCloseTo(plain.y[150][2], 6);
    const roomy = ep.seihrd(0.4, 0.2, 0.15, y0, 300, { hospital: 0.05, fatality: 0.1 });
    roomy.y.forEach((s) => expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1e5, 4));
    // Everyone who went to hospital leaves it eventually: deaths = fatality × admissions.
    const adm = roomy.admissions.reduce((s, x) => s + x, 0), D = roomy.y[300][5];
    expect(D / adm).toBeCloseTo(0.1, 2);
    const tight = ep.seihrd(0.4, 0.2, 0.15, y0, 300, { hospital: 0.05, fatality: 0.1, beds: 200, fatalityNoBed: 0.6 });
    expect(tight.y[300][5]).toBeGreaterThan(1.5 * D);
  });
  it('fitEpidemic gives 95% intervals that hold the truth', () => {
    const made = ep.sir(0.32, 0.12, [1e6 - 30, 30, 0], 120).incidence;
    let s2 = 3;
    const noisy = made.map((x) => { s2 = (Math.imul(s2, 1664525) + 1013904223) >>> 0; return Math.max(0, Math.round(x * (1 + 0.1 * (s2 / 2 ** 32 - 0.5)))); });
    const f = ep.fitEpidemic(noisy, 1e6);
    expect(f.ci.r0[0]).toBeLessThan(0.32 / 0.12); expect(f.ci.r0[1]).toBeGreaterThan(0.32 / 0.12);
    expect(f.ci.beta[0]).toBeLessThan(f.beta); expect(f.ci.beta[1]).toBeGreaterThan(f.beta);
    expect(ep.studentT975(10)).toBeCloseTo(2.228, 2);
  });
  it('in the language', () => {
    const r = run("rng(1); [t, I, ever] = sirGillespie(0.3, 0.1, [499 1 0], 100, 'Runs', 5); sirGillespie(0.3, 0.1, [499 1 0], 100, 'Runs', 5)\n[t2, y] = seihrd(0.4, 0.2, 0.15, [99990 0 10 0 0 0], 200, 'Beds', 100);\nseihrd(0.4, 0.2, 0.15, [99990 0 10 0 0 0], 200, 'Beds', 100, 'Intervention', [30 90 0.4])");
    expect(r.d('I').length).toBe(101 * 5);
    expect(r.d('y').length).toBe(201 * 6);
    expect(r.out).toMatch(/died out early/);
    expect(r.out).toMatch(/over for \d+ day/);
    expect(r.graphics.figures.length).toBeGreaterThan(0);
  });
});
