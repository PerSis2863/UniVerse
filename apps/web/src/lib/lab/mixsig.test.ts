import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { FileStore } from './files';
import { toMat, type Struct } from './values';
import * as M from './mixsig';
import { adcMetrics, inlDnl } from './convert';
import { Graphics } from './plot';
import './grid-lab';
import './codegen-lab';
import './mixsig-lab';

const lab = () => { const files = new FileStore(); let out = ''; const l = new Lab({ out: (t) => { out += t; }, files, graphics: new Graphics() }); return { l, files, out: () => out }; };
const f = (l: Lab, s: string, k: string) => toMat((l.vars.get(s) as Struct).f.get(k)!).d;
let hasCc = true;
try { execFileSync('cc', ['--version'], { stdio: 'ignore' }); } catch { hasCc = false; }

describe('Hyperion mixed-signal (M568): PLLs', () => {
  const d = M.pllDesign({ fref: 25e6, fout: 2.4e9, bandwidth: 500e3, kvco: 100e6, icp: 1e-3 });
  it('designs the loop filter for its bandwidth and phase margin', () => {
    expect(d.n).toBe(96);
    const b = M.pllBode(d, [500e3]);
    expect(b.mag[0]).toBeCloseTo(0, 6); // crosses 0 dB at the bandwidth
    expect(180 + b.phase[0]).toBeCloseTo(55, 6); // with the margin asked for
    expect(d.c2).toBeGreaterThan(d.c1);
    expect(() => M.pllDesign({ fref: 25e6, fout: 2.4e9, bandwidth: 10e6, kvco: 1e8, icp: 1e-3 })).toThrow(/quarter/);
  });
  it('locks an integer-N and a fractional-N loop to the exact frequency', () => {
    const r = M.pllSim(d, { cycles: 600 });
    expect(r.locked).toBe(true);
    expect(r.lockTime).toBeLessThan(10e-6);
    expect(r.fout.at(-1)! / 2.4e9 - 1).toBeLessThan(1e-9);
    expect(r.vc.at(-1)).toBeCloseTo(0.72, 3); // 3% from f0 at 100 MHz/V
    const df = M.pllDesign({ fref: 25e6, fout: 2.41e9 + 123456, bandwidth: 500e3, kvco: 100e6, icp: 1e-3 });
    const rf = M.pllSim(df, { cycles: 1500 });
    expect(rf.locked).toBe(true);
    const avg = rf.fout.slice(-400).reduce((a, b) => a + b, 0) / 400;
    expect(Math.abs(avg / df.fout - 1)).toBeLessThan(1e-6); // the MASH's average is the fraction
    expect(Math.min(...rf.nUsed)).toBeGreaterThanOrEqual(93); expect(Math.max(...rf.nUsed)).toBeLessThanOrEqual(100);
  });
  it('shapes the phase noise: the reference ×N² inside the loop, the VCO outside', () => {
    const z = M.pllNoise(d, [1e3, 1e8], { refNoise: -150, vcoNoise: -110, vcoAt: 1e6, floor: -200 });
    expect(z.total[0]).toBeCloseTo(-150 + 20 * Math.log10(96), 0);
    expect(z.total[1]).toBeCloseTo(-110 - 40, 0); // 2 decades past 1 MHz, −20 dB a decade
    expect(z.jitter).toBeGreaterThan(0);
  });
});

describe('Hyperion mixed-signal (M568): converters', () => {
  const N = 8192, x = Array.from({ length: N }, (_, i) => 0.99 * Math.sin(2 * Math.PI * 1031 * i / N));
  const enob = (c: number[]) => adcMetrics(c.map((k) => -1 + (k + 0.5) * 2 / 1024), 1).enob;
  it('flash, SAR and pipeline are all 10 bits when ideal, and each flaw costs bits', () => {
    for (const a of ['flash', 'sar', 'pipeline'] as const) expect(enob(M.archAdc(x, a, 10))).toBeGreaterThan(9.9);
    expect(enob(M.archAdc(x, 'sar', 10, -1, 1, { mismatch: 0.02 }))).toBeLessThan(9.9);
    expect(enob(M.archAdc(x, 'pipeline', 10, -1, 1, { gain: 0.01 }))).toBeLessThan(9);
    // a pipeline's redundancy forgives small comparator offsets, not large ones
    expect(enob(M.archAdc(x, 'pipeline', 10, -1, 1, { offset: 0.03 }))).toBeGreaterThan(9.9);
    expect(enob(M.archAdc(x, 'pipeline', 10, -1, 1, { offset: 0.1 }))).toBeLessThan(8);
  });
  it('the code-density test reads each ADC’s INL (a coherent sine just past full scale)', () => {
    const y = Array.from({ length: 32768 }, (_, i) => 1.02 * Math.sin(2 * Math.PI * 1031 * i / 32768));
    const worst = (c: number[]) => Math.max(...inlDnl(c, 10).inl.map(Math.abs));
    expect(worst(M.archAdc(y, 'sar', 10))).toBeLessThan(0.2);
    expect(worst(M.archAdc(y, 'flash', 10, -1, 1, { offset: 0.3 }))).toBeGreaterThan(0.5);
  });
  it('a thermometer DAC has far smaller DNL than a binary one with the same sources', () => {
    const dnl = (a: M.DacArch) => Math.max(...M.archDac(a, 10, 0.02).dnl.map(Math.abs));
    expect(dnl('thermometer')).toBeLessThan(dnl('binary') / 4);
    expect(dnl('segmented')).toBeLessThan(dnl('binary'));
    const ideal = M.archDac('binary', 8, 0);
    expect(Math.max(...ideal.inl.map(Math.abs))).toBeLessThan(1e-9);
  });
});

describe('Hyperion mixed-signal (M568): SerDes', () => {
  it('makes PRBS7 with its period of 127', () => {
    const b = M.prbs(7, 254);
    expect(b.slice(0, 127)).toEqual(b.slice(127));
    expect(b.slice(0, 127).reduce((s, v) => s + v, 0)).toBe(64); // 64 ones, 63 zeros
  });
  it('a lossy channel closes the eye and FFE, CTLE and DFE open it again', () => {
    const base = { rate: 25e9, noise: 0.01, jitter: 0.01 };
    expect(M.linkRun({ ...base, loss: 10 }).eyeHeight).toBeGreaterThan(0.3);
    const closed = M.linkRun({ ...base, loss: 20 });
    expect(closed.eyeHeight).toBe(0);
    const eq = M.linkRun({ ...base, loss: 20, ffe: [-0.1, 0.8, -0.1], ctle: 8, dfe: 3 });
    expect(eq.eyeHeight).toBeGreaterThan(0.1);
    expect(eq.widthAt).toBeGreaterThan(0.5);
    // the CDR settles near the eye's centre
    const dist = Math.abs(eq.cdr.at(-1)! - eq.bestPhase);
    expect(Math.min(dist, 32 - dist)).toBeLessThanOrEqual(5);
    expect(M.linkRun({ ...base, loss: 20, pam4: true, ctle: 8, dfe: 3 }).levels).toHaveLength(4);
  });
});

describe('Hyperion mixed-signal (M568): in the language', () => {
  it('plldesign → pllsim → pllnoise, adcarch, dacarch, serdes', () => {
    const { l } = lab();
    l.run("p = plldesign(25e6, 2.4e9, 500e3, 'Kvco', 100e6, 'Icp', 1e-3); s = pllsim(p, 'Cycles', 500); z = pllnoise(p);");
    expect(f(l, 'p', 'N')[0]).toBe(96); expect(f(l, 's', 'Locked')[0]).toBe(1); expect(f(l, 'z', 'Jitter')[0]).toBeGreaterThan(0);
    l.run("x = 0.9*sin(2*pi*(0:4095)*67/4096); [c, q] = adcarch(x, 'Pipeline', 12); m = adcmetrics(q); [o, inl, dnl] = dacarch('Thermometer', 8, 0.01);");
    expect(f(l, 'm', 'ENOB')[0]).toBeGreaterThan(11.5);
    l.run("k = serdes('Rate', 25e9, 'Loss', 20, 'CTLE', 8, 'DFE', 3, 'FFE', [-0.1 0.8 -0.1]); b = prbs(15, 100);");
    expect(f(l, 'k', 'EyeHeight')[0]).toBeGreaterThan(0.1);
    expect(toMat(l.vars.get('b')!).d.length).toBe(100);
    // drawing without outputs doesn't fail
    l.run("plldesign(25e6, 2.4e9, 500e3); pllsim(p); pllnoise(p); dacarch('Binary', 6, 0.02); serdes('Loss', 12); eyediagram(k.Wave, 32);");
    expect(() => l.run("adcarch(x, 'Delta', 8)")).toThrow(/Flash/);
    expect(() => l.run("serdes('Speed', 1)")).toThrow(/no option 'Speed'/);
  });
  it('dpigen writes C, a DPI-C block and a self-checking testbench with Hyperion’s answers', () => {
    const { l, files } = lab();
    l.run(`function [y, e] = quant(x, step)
  y = round(x / step) * step;
  e = sum(abs(y - x));
end`);
    l.run("dpigen('quant', {[0.12 0.37 -0.51 0.9], 0.25})");
    const sv = files.text('quant_dpi.sv'), tb = files.text('quant_tb.sv');
    expect(sv).toContain('import "DPI-C" function void quant(input real x [4], input real step, output real y [4], output real e);');
    expect(sv).toContain('always @(posedge clk) quant(x, step, y, e);');
    expect(tb).toContain('y[1] - 0.25'); // round(0.37/0.25)*0.25 = 0.25
    expect(tb).toContain('PASS: quant matches Hyperion');
    if (!hasCc) return;
    const dir = mkdtempSync(join(tmpdir(), 'hyp-dpi-'));
    writeFileSync(join(dir, 'quant.c'), files.text('quant.c')); writeFileSync(join(dir, 'quant.h'), files.text('quant.h'));
    execFileSync('cc', ['-c', '-std=c99', '-Wall', '-Werror', '-o', join(dir, 'q.o'), join(dir, 'quant.c')]);
  });
  it('amigen writes an IBIS-AMI model whose C builds and equalises', () => {
    const { l, files } = lab();
    l.run("amigen('hyprx', 'Rx', 'CTLE', 8, 'DFE', 3, 'Rate', 25e9); amigen('hyptx', 'Tx', 'FFE', [-0.1 0.8 -0.1])");
    expect(files.text('hyprx.ami')).toContain('(ctle_peaking_db (Usage In) (Type Float) (Format Range 8 0 30) (Default 8))');
    expect(files.text('hyprx.ibs')).toContain('Executable Linux_gcc_64 hyprx_linux64.so hyprx.ami');
    expect(files.text('hyptx.ami')).toContain('(tap1 (Usage In) (Type Float) (Format Range 0.8 -1 1) (Default 0.8)');
    if (!hasCc) return;
    const dir = mkdtempSync(join(tmpdir(), 'hyp-ami-'));
    for (const n of ['hyprx', 'hyptx']) {
      writeFileSync(join(dir, `${n}_ami.c`), files.text(`${n}_ami.c`));
      execFileSync('cc', ['-shared', '-fPIC', '-O2', '-Wall', '-Werror', '-o', join(dir, `${n}.so`), join(dir, `${n}_ami.c`), '-lm']);
    }
    // drive the TX model: an impulse through FFE taps [-0.1 0.8 -0.1] at 4 samples a bit
    writeFileSync(join(dir, 'main.c'), `#include <stdio.h>
long AMI_Init(double*, long, long, double, double, char*, char**, void**, char**);
long AMI_Close(void*);
int main(void) { double h[16] = {0}; h[4] = 1; char *o, *m; void *s;
  AMI_Init(h, 16, 0, 1e-11, 4e-11, "", &o, &s, &m); for (int i = 0; i < 16; i++) printf("%g ", h[i]); AMI_Close(s); return 0; }`);
    execFileSync('cc', ['-o', join(dir, 'tx'), join(dir, 'main.c'), join(dir, 'hyptx_ami.c'), '-lm']);
    const got = execFileSync(join(dir, 'tx')).toString().trim().split(' ').map(Number);
    expect(got[0]).toBeCloseTo(-0.1); expect(got[4]).toBeCloseTo(0.8); expect(got[8]).toBeCloseTo(-0.1);
  });
});
