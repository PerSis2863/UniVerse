import { describe, expect, it } from 'vitest';
import * as si from './si';
import { Lab } from './interp';
import { Graphics } from './plot';
import { FileStore } from './files';
import './sciences';

const run = (code: string) => { let out = ''; const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics(), files: new FileStore() }); lab.run(code); return out; };
const f = Array.from({ length: 400 }, (_, i) => (i + 1) * 1e8);
const ln: si.Line = { length: 0.0254, z0: 50, dk: 3.7, df: 0.01, width: 127e-6, zref: 50 };
const base: si.Eye = { rate: 28e9, spu: 16, pam4: false, order: 7, nsym: 1200, swing: 0.8, ffe: [], ffePre: 0, dfe: 0, rj: 0.01, dj: 0.05, noise: 0.003, ber: 1e-12, xtalk: [], seed: 1 };

describe('signal and power integrity (M576)', () => {
  it('a trace loses ~0.9 dB an inch at 10 GHz on FR-4-class board; a matched line reflects nothing, a mismatched one does', () => {
    const s = si.lineS([1e10], ln);
    expect(20 * Math.log10(si.cabs(s.s21[0]))).toBeCloseTo(-0.9, 1);
    expect(si.cabs(s.s11[0])).toBeLessThan(1e-12);
    const mis = si.lineS([1e9], { ...ln, z0: 75, length: 299792458 / (4e9 * Math.sqrt(3.7)) });   // a quarter wave at 1 GHz
    expect(si.cabs(mis.s11[0])).toBeCloseTo((75 ** 2 - 50 ** 2) / (75 ** 2 + 50 ** 2), 1);
    // passivity: |S11|² + |S21|² ≤ 1
    expect(si.cabs(mis.s11[0]) ** 2 + si.cabs(mis.s21[0]) ** 2).toBeLessThanOrEqual(1 + 1e-12);
  });
  it("a via stub notches S21 at its quarter wave", () => {
    const stub = 0.004, fq = 299792458 / (4 * stub * Math.sqrt(3.7)), fr = [fq * 0.5, fq];
    const s = si.lineS(fr, { ...ln, stub: { length: stub, at: 0.5, z0: 50 } });
    expect(si.cabs(s.s21[1])).toBeLessThan(0.2 * si.cabs(s.s21[0]));
  });
  it('Touchstone: reads MA, DB and RI, round-trips what it writes', () => {
    const txt = `! a 2-port\n# GHz S MA R 50\n1 0.1 0 0.9 -90 0.9 -90 0.1 0\n2 0.2 45 0.8 -180 0.8 -180 0.2 45\n`;
    const t = si.touchstone(txt);
    expect(t.n).toBe(2); expect(t.f).toEqual([1e9, 2e9]);
    expect(t.s[0][1][0][0]).toBeCloseTo(0, 12); expect(t.s[0][1][0][1]).toBeCloseTo(-0.9, 12);
    const back = si.touchstone(si.writeTouchstone(t.f, t.s));
    expect(back.s[1][0][0][1]).toBeCloseTo(t.s[1][0][0][1], 9);
    const db = si.touchstone('# Hz S DB R 50\n1e9 -20 0 -1 0 -1 0 -20 0\n');
    expect(db.s[0][1][0][0]).toBeCloseTo(10 ** (-1 / 20), 12);
  });
  it('PRBS7 repeats every 127 bits and is balanced', () => {
    const b = si.prbs(7, 254);
    expect(b.slice(0, 127)).toEqual(b.slice(127));
    expect(b.slice(0, 127).reduce((s, v) => s + v, 0)).toBe(64);
  });
  it('a short channel has a wide open eye; a lossy one closes; equalisers reopen it', () => {
    const S = (len: number) => si.lineS(f, { ...ln, length: len }).s21;
    const short = si.eye(si.pulseResponse(f, S(0.05), 28e9, 16), base);
    expect(short.heightBest).toBeGreaterThan(0.5); expect(short.ber).toBeLessThan(1e-20);
    const p = si.pulseResponse(f, S(0.3), 28e9, 16), plain = si.eye(p, base), dfe = si.eye(p, { ...base, dfe: 6 });
    expect(dfe.heightBest).toBeGreaterThan(2 * plain.heightBest);
    const zf = si.ffeZeroForcing(p.p, p.cursor, 16, 1, 3), ffe = si.eye(p, { ...base, ffe: zf, ffePre: 1 });
    expect(ffe.width).toBeGreaterThan(plain.width);
    expect(zf.reduce((s, v) => s + Math.abs(v), 0)).toBeCloseTo(1, 12);
  });
  it('PAM4 has three eyes, a third of the height; crosstalk shrinks the eye', () => {
    const p = si.pulseResponse(f, si.lineS(f, { ...ln, length: 0.05 }).s21, 28e9, 16);
    const nrz = si.eye(p, { ...base, rj: 0, dj: 0 }), pam = si.eye(p, { ...base, pam4: true, rj: 0, dj: 0 });
    expect(pam.thresholds).toHaveLength(3);
    expect(pam.heightBest / nrz.heightBest).toBeLessThan(0.4); expect(pam.heightBest / nrz.heightBest).toBeGreaterThan(0.25);
    const xt = si.eye(p, { ...base, xtalk: [[0.05, 0.05]] });
    expect(xt.heightBest).toBeLessThan(nrz.heightBest);
  });
  it('PDN: series resonances dip, anti-resonances peak; a load step droops', () => {
    const parts: si.PdnPart[] = [{ kind: 'vrm', count: 1, c: 0, esr: 1e-3, esl: 20e-9 }, { kind: 'cap', count: 10, c: 100e-6, esr: 5e-3, esl: 1.5e-9 }, { kind: 'cap', count: 60, c: 1e-6, esr: 5e-3, esl: 0.4e-9 }];
    const fr = Array.from({ length: 300 }, (_, i) => 10 ** (3 + (i * 6) / 299)), r = si.pdn(parts, 1e-3, fr, { dI: 50, tr: 1e-9, dur: 50e-6 });
    expect(r.peaks.length).toBeGreaterThanOrEqual(2);
    // one MLCC group's series resonance: 1/(2π√(LC))
    const fs = 1 / (2 * Math.PI * Math.sqrt(0.4e-9 * 1e-6)), z = si.cabs(si.pdnZ(fs, [parts[2]]));
    expect(z).toBeCloseTo(5e-3 / 60, 9);
    expect(r.droop!.worst).toBeLessThan(-0.01);
    expect(r.over.length).toBeGreaterThan(0);
  });
  it('IR drop: a strip matches ρL/(wt), a void forces the current round it', () => {
    const strip = si.irDrop({ W: 0.1, H: 0.01, nx: 100, ny: 10, oz: 1, vrm: [[0, 0, 0.001, 0.01, 1]], loads: [[0.099, 0, 0.001, 0.01, 10]], voids: [] });
    expect(strip.worst).toBeCloseTo((10 * 1.72e-8 * 0.099) / (0.01 * 34.8e-6), 3);
    expect(Math.max(...[...strip.J].filter(Number.isFinite))).toBeCloseTo(10 / (0.01 * 34.8e-6) / 1e6, 0);
    const holed = si.irDrop({ W: 0.1, H: 0.01, nx: 100, ny: 10, oz: 1, vrm: [[0, 0, 0.001, 0.01, 1]], loads: [[0.099, 0, 0.001, 0.01, 10]], voids: [[0.04, 0, 0.02, 0.007]] });
    expect(holed.worst).toBeGreaterThan(strip.worst * 1.3);
    expect(() => si.irDrop({ W: 0.1, H: 0.01, nx: 20, ny: 4, oz: 1, vrm: [], loads: [], voids: [] })).toThrow();
  });
  it('speaks the language', () => {
    const out = run(`S = sparamLine(1e8:1e8:4e10, 'Length', 0.25);
e = eyeDiagram(S, 28e9, 'CTLE', 'auto', 'DFE', 4, 'RJ', 0.01, 'Symbols', 800);
e0 = eyeDiagram(S, 28e9, 'Symbols', 800);
s21 = rfparam(S, 2, 1); txt = touchstoneWrite(S); S2 = sparameters(txt);
z = pdnImpedance(logspace(3, 9, 100), 'VRM', [1e-3 20e-9], 'Caps', [10 100e-6 5e-3 1.5e-9; 60 1e-6 5e-3 0.4e-9]);
r = irDrop('Size', [0.05 0.04], 'Grid', [50 40], 'VRM', [0 0 0.005 0.04 0.9], 'Loads', [0.03 0.015 0.01 0.01 30]);
fprintf('%d %d %d %.4f %d\\n', e.Height > e0.Height, numel(e.CTLE), abs(rfparam(S2, 2, 1)(end) - s21(end)) < 1e-6, r.Worst, numel(z))`);
    const [better, nctle, same, worst, nz] = out.trim().split(' ').map(Number);
    expect([better, nctle, same, nz]).toEqual([1, 4, 1, 100]); expect(worst).toBeGreaterThan(0.001);
  });
});
