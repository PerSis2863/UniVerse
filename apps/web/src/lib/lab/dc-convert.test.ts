import { describe, expect, it } from 'vitest';
import * as cv from './dc-convert';
import { Lab } from './interp';
import { Graphics } from './plot';
import './sciences';

const run = (code: string) => { let out = ''; const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics() }); lab.run(code); return out; };
const D = cv.dabDesign(1600, 800, 250e3, 50e3);

describe('the 800 V DC solid-state transformer (M573)', () => {
  it('the DAB carries its rating at the design phase, its most at π/2', () => {
    expect(cv.dabPower(1600, 800, D.n, D.L, 50e3, Math.PI / 6)).toBeCloseTo(250e3, 3);
    expect(D.pmax / 250e3).toBeCloseTo((Math.PI / 2) ** 2 / ((Math.PI / 6) * ((5 * Math.PI) / 6)), 9);
    expect(cv.dabPhase(1600, 800, D.n, D.L, 50e3, 250e3)).toBeCloseTo(Math.PI / 6, 9);
    expect(cv.dabPhase(1600, 800, D.n, D.L, 50e3, 2 * D.pmax)).toBeNaN();
  });
  it("the waveform's power matches the formula; unity gain switches at zero voltage, a light load off-gain does not", () => {
    const w = cv.dabWaveform(1600, 800, D.n, D.L, 50e3, Math.PI / 6);
    expect(w.power / 250e3).toBeCloseTo(1, 2);
    expect(w.zvsPrimary && w.zvsSecondary).toBe(true);
    const off = cv.dabWaveform(1600, 600, D.n, D.L, 50e3, 0.05);
    expect(off.zvsPrimary && off.zvsSecondary).toBe(false);
  });
  it('efficiency is high mid-load and falls at light load', () => {
    const e = (p: number) => cv.dabLosses(1600, 800, D.n, D.L, 50e3, p, cv.DEVICES)!.efficiency;
    expect(e(150e3)).toBeGreaterThan(0.97); expect(e(150e3)).toBeLessThan(0.999);
    expect(e(10e3)).toBeLessThan(e(150e3));
  });
  const s: cv.Sst = { v1: 1600, v2: 800, n: D.n, L: D.L, fs: 50e3, pmax: 250e3, c1: 2e-3, c2: 3e-3, ts: 2e-5, bw1: 20, bw2: 300, tauI: 5e-4, etaPfc: 0.985, etaDab: 0.985, fidelity: 'average' };
  it('the closed loop holds the bus through a 100 kW load step and returns to 800 V', () => {
    const t = Array.from({ length: 401 }, (_, i) => i * 1e-4), load = t.map((x) => (x < 0.01 ? 100e3 : 200e3));
    const r = cv.sstSimulate(t, load, s);
    const dev = Math.max(...r.V2.map((v) => Math.abs(v - 800)));
    expect(dev).toBeGreaterThan(1); expect(dev).toBeLessThan(40);
    expect(Math.abs(r.V2[400] - 800)).toBeLessThan(1);
    expect(Math.abs(r.V1[400] - 1600)).toBeLessThan(15);
    expect(r.Pg[400]).toBeCloseTo(200e3 / (0.985 * 0.985), -3);
  });
  it('the switching model agrees with the average one, with ripple', () => {
    const t = Array.from({ length: 101 }, (_, i) => i * 4e-5), load = t.map(() => 150e3);
    const sw = cv.sstSimulate(t, load, { ...s, fidelity: 'switching' }), av = cv.sstSimulate(t, load, s);
    expect(Math.abs(sw.V2[100] - av.V2[100])).toBeLessThan(5);
  });
  it('writes the controller as C and Verilog', () => {
    expect(cv.controllerCode(0.01, 5, 2e-5, 800, -1.5, 1.5, 'c')).toMatch(/float pi_step/);
    const v = cv.controllerCode(0.01, 5, 2e-5, 800, -1.5, 1.5, 'verilog');
    expect(v).toMatch(/module pi_bus/); expect(v).toMatch(/REF = 52428800/);
  });
  it('speaks the language', () => {
    const out = run(`d = dabDesign(1600, 800, 250e3, 50e3); eff = dabEfficiency(1600, 800, d.n, d.L, d.fs, [50e3 150e3]);
r = sstSimulate(d, 0:1e-4:0.02, 150e3); code = dcControllerCode(r.Kp(2), r.Ki(2), 2e-5, 800, 'Language', 'verilog');
[~, ~, w] = dabWaveform(1600, 800, d.n, d.L, d.fs, pi/6);
fprintf('%.3f %.1f %d %d\\n', eff(2), r.V2(end), ~isempty(strfind(code, 'module')), w.ZVSPrimary)`);
    const [e, v, m, z] = out.trim().split(' ').map(Number);
    expect(e).toBeGreaterThan(0.97); expect(v).toBeCloseTo(800, 0); expect(m).toBe(1); expect(z).toBe(1);
  });
});
