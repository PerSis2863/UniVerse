import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as ami from './ami';
import * as si from './si';
import { ibisNum, readAnalog, rxGain, throughFrontEnds, txGain } from './ibis-analog';
import { b64ToF64, f64ToB64, setNative, type Native } from './native';
import { Lab } from './interp';
import { Graphics } from './plot';
import { FileStore } from './files';
import './sciences';

const calls: number[] = [];
const AMI = fs.readFileSync(path.join(__dirname, 'fixtures', 'test-ffe.ami'), 'utf8');
afterEach(() => setNative(null));

/** A stand-in for the computer app: the test model's two-tap FFE done in JavaScript. */
const fake = (tapOf: (p: string) => number): Native => (_op, body) => {
  const b = body as { params: string; impulse: string; rows: number; dt: number; ui: number; wave?: string };
  const tap = tapOf(b.params), spu = Math.round(b.ui / b.dt), k = 1 / (1 + 2 * Math.abs(tap));
  const ffe = (x: number[]) => x.map((v, i) => k * ((1 + tap) * v + tap * (i >= spu ? x[i - spu] : 0)));
  const flat = b64ToF64(b.impulse), cols = Array.from({ length: flat.length / b.rows }, (_, c) => ffe(flat.slice(c * b.rows, (c + 1) * b.rows)));
  calls.push(cols.length);
  const out: Record<string, unknown> = { ok: true, impulse: f64ToB64(cols.flat()), paramsOut: '(test_tx)', message: 'fake', hasGetWave: true };
  if (b.wave) { const w = ffe(b64ToF64(b.wave)); out.wave = f64ToB64(w); out.clocks = f64ToB64(w.filter((_, i) => i % spu === 0).map((_, i) => (i + 0.5) * b.ui)); }
  return out;
};
const tapOf = (p: string) => Number(/\(tap (-?[\d.]+)\)/.exec(p)?.[1] ?? -0.2);

describe('IBIS-AMI in Hyperion (M577)', () => {
  it('reads an .ami file: the reserved flags and the input parameters with their defaults, lists and ranges', () => {
    const m = ami.readAmi(AMI);
    expect(m.root).toBe('test_tx');
    expect([m.initReturnsImpulse, m.getWaveExists, m.ignoreBits]).toEqual([true, true, 0]);
    expect(m.params.map((p) => p.path.join('.'))).toEqual(['tap', 'mode', 'label', 'report', 'eq.adapt']);
    expect(m.params[0].range).toEqual([-0.2, -0.5, 0]);
    expect(ami.paramString(m, new Map())).toBe('(test_tx (tap -0.2) (mode 1) (label "lane0") (eq (adapt True)))');
    expect(ami.paramString(m, new Map([['tap', '-0.3'], ['eq.adapt', 'False']]))).toBe('(test_tx (tap -0.3) (mode 1) (label "lane0") (eq (adapt False)))');
    expect(() => ami.paramString(m, new Map([['tap', '0.4']]))).toThrow(/between -0.5 and 0/);
    expect(() => ami.paramString(m, new Map([['mode', '5']]))).toThrow(/one of 0, 1, 2/);
    expect(() => ami.paramString(m, new Map([['gain', '1']]))).toThrow(/no input parameter called gain/);
  });
  it("reads the older 'Format' way and refuses broken files", () => {
    const old = ami.readAmi('(rx (Reserved_Parameters (Init_Returns_Impulse (Usage Info) (Type Boolean) (Format Value True)) (GetWave_Exists (Usage Info) (Type Boolean) (Format Value False))) (Model_Specific (gain (Usage In) (Type Float) (Format Range 2 0 6))))');
    expect([old.initReturnsImpulse, old.getWaveExists]).toEqual([true, false]);
    expect(ami.paramString(old, new Map())).toBe('(rx (gain 2))');
    expect(() => ami.readAmi('(rx (Model_Specific')).toThrow(/never closed/);
  });
  it('in a browser, says the models need the computer app', () => {
    expect(() => ami.session({ name: 't', file: { name: 't.dll', path: '/x/t.dll' }, params: '(t)', info: ami.readAmi(AMI) }, [[1, 0]], 1, 1)).toThrow(/computer app/);
  });
  it('the statistical flow equalises the impulse; the time-domain flow runs the waveform through both models', () => {
    setNative(fake(tapOf));
    const info = ami.readAmi(AMI), tx: ami.Model = { name: 'tx', file: { name: 't.so', path: '/t.so' }, params: ami.paramString(info, new Map([['tap', '-0.25']])), info };
    const h = new Array(64).fill(0); h[3] = 1e12;
    const s = ami.flow(h, 1e-12, 8e-12, tx, null, null);
    expect(s.hRx[3] / 1e12).toBeCloseTo(0.5, 12); expect(s.hRx[11] / 1e12).toBeCloseTo(-1 / 6, 12);
    const x = new Array(80).fill(0.4), t = ami.flow(h, 1e-12, 8e-12, tx, tx, x);
    expect(t.usedGetWave).toEqual([true, true]);
    expect(t.z![79]).toBeCloseTo(0.4 * (1 / 3) * (1 / 3), 9);   // two FFEs in a row on a steady level, through a lossless channel
  });
  it('eyeDiagram with AMI models: a transmit FFE opens a lossy channel the plain eye leaves nearly shut', () => {
    setNative(fake(tapOf));
    let out = '';
    const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics(), files: new FileStore() });
    (lab.host as { files: FileStore }).files.load('tx.ami', { bytes: new TextEncoder().encode(AMI) });
    lab.run(`S = sparamLine(1e8:1e8:4e10, 'Length', 0.35);
tx = amiModel('C:/models/tx.dll', 'tx.ami', 'tap', -0.3);
e0 = eyeDiagram(S, 28e9, 'Symbols', 1500);
e1 = eyeDiagram(S, 28e9, 'TxModel', tx, 'Symbols', 1500);
e2 = eyeDiagram(S, 28e9, 'TxModel', tx, 'Flow', 'statistical', 'Symbols', 1500);
r = amiSimulate(S, 28e9, 'TxModel', tx, 'Symbols', 300);
fprintf('%.4f %.4f %.4f %d %d\\n', e0.Height, e1.Height, e2.Height, numel(r.Wave) == 300*16, strcmp(e1.AMI.Flow, 'timedomain'))
amiModel('C:/models/tx.dll', 'tx.ami')`);
    const [h0, h1, h2, n, f] = out.trim().split('\n')[0].split(' ').map(Number);
    expect(h1).toBeGreaterThan(h0); expect(h2).toBeGreaterThan(h0); expect([n, f]).toEqual([1, 1]);
    expect(out).toMatch(/tap = -0.2 {2}-0.5 to 0/);
  });

  it('crosstalk: the aggressors go to AMI_Init as extra columns (up to Max_Init_Aggressors) and shrink the eye', () => {
    setNative(fake(tapOf));
    let out = '';
    const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics(), files: new FileStore() });
    (lab.host as { files: FileStore }).files.load('tx.ami', { bytes: new TextEncoder().encode(AMI) });
    (lab.host as { files: FileStore }).files.load('one.ami', { bytes: new TextEncoder().encode(AMI.replace('(Ignore_Bits', '(Max_Init_Aggressors (Usage Info) (Type Integer) (Value 1))\n    (Ignore_Bits')) });
    calls.length = 0;
    lab.run(`S = sparamLine(1e8:1e8:4e10, 'Length', 0.2); tx = amiModel('C:/m/tx.dll', 'tx.ami'); one = amiModel('C:/m/tx.dll', 'one.ami');
a = eyeDiagram(S, 28e9, 'TxModel', tx, 'Flow', 'statistical', 'Symbols', 1200);
b = eyeDiagram(S, 28e9, 'TxModel', tx, 'Flow', 'statistical', 'Symbols', 1200, 'Crosstalk', [0.03 0.05]);
c = eyeDiagram(S, 28e9, 'TxModel', tx, 'Symbols', 1200, 'Crosstalk', [0.03 0.05]);
d = eyeDiagram(S, 28e9, 'TxModel', one, 'Flow', 'statistical', 'Symbols', 1200, 'Crosstalk', [0.03 0.05]);
r = amiSimulate(S, 28e9, 'TxModel', tx, 'Flow', 'statistical', 'Crosstalk', [0.03 0.05]);
fprintf('%d %d %d %d\\n', b.Height < a.Height, c.Height < a.Height, b.AMI.Aggressors, size(r.AggressorsRx, 1))`);
    expect(out.trim()).toBe('1 1 2 2');
    expect(calls).toContain(3); expect(calls).toContain(2);   // three columns, and two for the model limited to one aggressor
  });
  // The real thing: the desktop app's runner loads the compiled test model (needs desktop/hyperion's koffi and gcc).
  const desk = path.resolve(__dirname, '../../../../../desktop/hyperion');
  const lib = path.join(os.tmpdir(), 'hyperion-ami-vitest.so');
  let real = process.platform === 'linux' && fs.existsSync(path.join(desk, 'node_modules', 'koffi'));
  if (real) try { execFileSync('gcc', ['-shared', '-fPIC', '-O2', path.join(desk, 'test', 'ami-test-model.c'), '-o', lib]); } catch { real = false; }
  it.skipIf(!real)('runs a real compiled model through the computer app\'s runner, end to end', () => {
    // A synchronous bridge like the app's: the request handed to ami-host.js's session in a Node process.
    setNative((_op, body) => {
      const script = `const h = require(${JSON.stringify(path.join(desk, 'ami-host.js'))}), a = require(${JSON.stringify(path.join(desk, 'ami.js'))});
const fs = require('fs'), os = require('os'), path = require('path');
const req = JSON.parse(fs.readFileSync(0, 'utf8'));
let out;
if (process.argv[1] === 'link') {
  const t = a.prepare(req.tx.executable), r = a.prepare(req.rx.executable), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bci-'));
  out = h.link({ ...req, op: 'link', tx: { file: t.file, params: req.tx.params }, rx: { file: r.file, params: req.rx.params }, dir });
} else { const p = a.prepare(req.executable); out = p.error ? { ok: false, error: p.error } : h.session({ ...req, file: p.file }); }
Promise.resolve(out).then((o) => process.stdout.write(JSON.stringify(o)));`;
      const r = spawnSync(process.execPath, ['-e', script, _op], { input: JSON.stringify(body), maxBuffer: 1e9 });
      return JSON.parse(String(r.stdout));
    });
    let out = '';
    const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics(), files: new FileStore() });
    const files = (lab.host as { files: FileStore }).files;
    files.load('tx.ami', { bytes: new TextEncoder().encode(AMI) });
    files.load('tx.so', { bytes: fs.readFileSync(lib) });
    lab.run(`S = sparamLine(1e8:1e8:4e10, 'Length', 0.35); tx = amiModel('tx.so', 'tx.ami', 'tap', -0.3);
e0 = eyeDiagram(S, 28e9, 'Symbols', 1500); e1 = eyeDiagram(S, 28e9, 'TxModel', tx, 'Symbols', 1500);
e2 = eyeDiagram(S, 28e9, 'TxModel', tx, 'RxModel', tx, 'Symbols', 1500);
fprintf('%.4f %.4f %d\\n', e0.Height, e1.Height, numel(e2.AMI.Clocks))`);
    const [h0, h1, clocks] = out.trim().split(' ').map(Number);
    expect(h1).toBeGreaterThan(h0); expect(clocks).toBeGreaterThan(1000);
    expect(si.alignWave([0, 1, 0, -1, 0, 1], [1, -1, 1], 2, 2).delay).toBe(1);
  }, 60000);
});

describe('IBIS files (M578)', () => {
  const IBS = `[IBIS Ver] 7.1
[Comment Char] #_char
[Component] chip  # a comment
[Model] serdes_tx
Model_type Output
[Algorithmic Model]
Executable Windows_VisualStudio_32 tx32.dll tx.ami
Executable Windows_VisualStudio_64 tx64.dll tx.ami
Executable Linux_gcc4.8_64 libtx64.so tx.ami   # the Linux one
[End Algorithmic Model]
[Model] plain_io
Model_type I/O
[Model] repeater
[Algorithmic Model]
Executable_Rx Linux_gcc_64 rep_rx.so rep_rx.ami
Executable_Tx Linux_gcc_64 rep_tx.so rep_tx.ami
[End Algorithmic Model]
[End]
`;
  it('lists the algorithmic models and picks the library for this computer, 64-bit first', () => {
    const m = ami.readIbis(IBS);
    expect(m.map((x) => x.name)).toEqual(['serdes_tx', 'repeater']);
    expect(m[0].executables.map((e) => [e.os, e.bits, e.lib])).toEqual([['windows', 32, 'tx32.dll'], ['windows', 64, 'tx64.dll'], ['linux', 64, 'libtx64.so']]);
    setNative(() => ({}), { platform: 'win32', arch: 'x64' });
    expect(ami.pickExecutable(m[0]).lib).toBe('tx64.dll');
    setNative(() => ({}), { platform: 'linux', arch: 'x64' });
    expect(ami.pickExecutable(m[0]).lib).toBe('libtx64.so');
    expect(ami.pickExecutable(m[1], 'tx').lib).toBe('rep_tx.so');
    setNative(() => ({}), { platform: 'darwin', arch: 'arm64' });
    expect(() => ami.pickExecutable(m[0])).toThrow(/no library for mac/);
  });
  it('amiModel from an .ibs file finds the files in Hyperion\'s files or a folder on the computer', () => {
    setNative(() => ({}), { platform: 'linux', arch: 'x64' });
    let out = '';
    const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics(), files: new FileStore() });
    const files = (lab.host as { files: FileStore }).files;
    files.load('chip.ibs', { bytes: new TextEncoder().encode(IBS) });
    files.load('tx.ami', { bytes: new TextEncoder().encode(AMI) });
    lab.run(`m = amiModel('chip.ibs', 'serdes_tx', 'Folder', '/opt/models', 'tap', -0.3); fprintf('%s|%s|%s\\n', m.Executable, m.Platform, m.Parameters)
ibisModels('chip.ibs')`);
    expect(out).toMatch(/^\/opt\/models\/libtx64\.so\|Linux_gcc4\.8_64\|\(test_tx \(tap -0\.3\)/);
    expect(out).toMatch(/repeater:\n {2}Linux_gcc_64 {2}rep_rx\.so {2}rep_rx\.ami {2}\(rx\)/);
    expect(() => lab.run("amiModel('chip.ibs', 'serdes_tx')")).toThrow(/Put libtx64\.so in your files/);
  });
});

describe('back-channel links (M579)', () => {
  const BCI = fs.readFileSync(path.join(__dirname, 'fixtures', 'test-bci.ami'), 'utf8');
  it("reads the BCI settings and gives both ends the tool's BCI_ID", () => {
    const m = ami.readAmi(BCI);
    expect(m.bci).toEqual({ protocol: 'hyperion_test', interval: 64, training: 512 });
    expect(ami.paramString(m, new Map([['role', 'rx']]))).toBe('(test_bci (BCI_ID "hyperion_link") (role "rx") (tap -0.1))');
  });
  it('runs a link when both ends speak the same protocol, the ordinary flow otherwise', () => {
    const ops: string[] = [];
    setNative((op, body) => { ops.push(op); const b = body as { wave: string; impulse: string }; return op === 'link' ? { ok: true, wave: b.wave, clocks: f64ToB64([]), history: [{ ui: 0, tx: '(a)', rx: '' }], files: ['hyperion_link.rx2tx'], paramsOut: ['', ''], messages: ['', ''] } : { ok: true, impulse: b.impulse, wave: b.wave }; });
    const info = ami.readAmi(BCI), tx: ami.Model = { name: 'tx', file: { name: 'b.so', path: '/b.so' }, params: ami.paramString(info, new Map()), info };
    const f = ami.flow([1e12, 0, 0, 0], 1e-12, 8e-12, tx, { ...tx, name: 'rx' }, new Array(64).fill(0.4));
    expect(ops).toEqual(['link']); expect(f.bci?.files).toEqual(['hyperion_link.rx2tx']);
    ami.flow([1e12, 0, 0, 0], 1e-12, 8e-12, tx, { ...tx, info: { ...info, bci: { ...info.bci!, protocol: 'other' } } }, new Array(64).fill(0.4));
    expect(ops.slice(1)).toEqual(['ami', 'ami']);
  });
  it('sends each neighbouring line to the link as it is, to be trained on its own (M582)', () => {
    let sent: { aggs?: { wave: string; h: string }[] } = {};
    setNative((op, body) => { sent = body as typeof sent; const b = body as { wave: string }; return { ok: true, wave: b.wave, clocks: f64ToB64([]), history: [], files: [], paramsOut: ['', ''], messages: ['', ''], lanes: [{ tx: '(t)', rx: '' }] }; });
    const info = ami.readAmi(BCI), tx: ami.Model = { name: 'tx', file: { name: 'b.so', path: '/b.so' }, params: ami.paramString(info, new Map()), info };
    const f = ami.flow([1e12, 0, 0, 0], 1e-12, 8e-12, tx, { ...tx, name: 'rx' }, new Array(64).fill(0.4), [{ h: [1e11, 0, 0, 0], x: new Array(64).fill(-0.4) }, { h: [1, 0, 0, 0] }]);
    expect(sent.aggs).toHaveLength(1);
    expect(b64ToF64(sent.aggs![0].h)).toEqual([1e11, 0, 0, 0]); expect(b64ToF64(sent.aggs![0].wave)[0]).toBe(-0.4);
    expect(f.bci?.lanes).toEqual([{ tx: '(t)', rx: '' }]);
  });
  it("without a back-channel, the neighbouring lines' signals go through the transmitter's own GetWave too (M582)", () => {
    const waves: number[] = [];
    setNative((op, body) => { const b = body as { wave?: string }; if (b.wave) waves.push(b64ToF64(b.wave)[0]); return fake(tapOf)(op, body); });
    const info = ami.readAmi(AMI), tx: ami.Model = { name: 'tx', file: { name: 't.so', path: '/t.so' }, params: ami.paramString(info, new Map([['tap', '-0.25']])), info };
    const h = [1e12, ...new Array(63).fill(0)], x = new Array(80).fill(0.4), g = new Array(80).fill(-0.4);
    const f = ami.flow(h, 1e-12, 8e-12, tx, null, x, [{ h: h.map((v) => v / 10), x: g }]);
    expect(waves).toEqual([0.4, -0.4]);                     // the victim's session, then the neighbour's
    // the neighbour reaches the pins through its FFE: -0.4 × 0.5 (the first UI's main tap) / 10
    expect(f.z![0]).toBeCloseTo(0.4 * 0.5 - 0.02, 9);
  });
  const desk = path.resolve(__dirname, '../../../../../desktop/hyperion');
  const lib = path.join(os.tmpdir(), 'hyperion-bci-vitest.so');
  let real = process.platform === 'linux' && fs.existsSync(path.join(desk, 'node_modules', 'koffi'));
  if (real) try { execFileSync('gcc', ['-shared', '-fPIC', '-O2', path.join(desk, 'test', 'ami-test-bci.c'), '-o', lib]); } catch { real = false; }
  it.skipIf(!real)('trains a real model pair through the runner: the transmitter takes the tap the receiver asked for', () => {
    setNative((op, body) => {
      const script = `const h = require(${JSON.stringify(path.join(desk, 'ami-host.js'))}), a = require(${JSON.stringify(path.join(desk, 'ami.js'))});
const fs = require('fs'), os = require('os'), path = require('path'), req = JSON.parse(fs.readFileSync(0, 'utf8'));
const t = a.prepare(req.tx.executable), r = a.prepare(req.rx.executable), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bci-'));
h.link({ ...req, op: 'link', tx: { file: t.file, params: req.tx.params }, rx: { file: r.file, params: req.rx.params }, dir }).then((o) => process.stdout.write(JSON.stringify(o)));`;
      expect(op).toBe('link');
      return JSON.parse(String(spawnSync(process.execPath, ['-e', script], { input: JSON.stringify(body), maxBuffer: 1e9 }).stdout));
    });
    let out = '';
    const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics(), files: new FileStore() });
    const files = (lab.host as { files: FileStore }).files;
    files.load('bci.ami', { bytes: new TextEncoder().encode(BCI) });
    files.load('bci.so', { bytes: fs.readFileSync(lib) });
    lab.run(`S = sparamLine(1e8:1e8:4e10, 'Length', 0.25);
tx = amiModel('bci.so', 'bci.ami', 'role', 'tx'); rx = amiModel('bci.so', 'bci.ami', 'role', 'rx');
e = eyeDiagram(S, 28e9, 'TxModel', tx, 'RxModel', rx, 'Symbols', 2000);
t = strsplit(e.AMI.BCI.TxParams, char(10));
fprintf('%s|%s|%s|%d\\n', t{1}, t{end}, e.AMI.BCI.Files, numel(e.AMI.Clocks) > 1500)
x = eyeDiagram(S, 28e9, 'TxModel', tx, 'RxModel', rx, 'Symbols', 2000, 'Crosstalk', [0 0.1]);
fprintf('%s|%s|%d\\n', x.AMI.BCI.Files, x.AMI.BCI.AggressorTxParams, max(abs(x.AMI.Wave - e.AMI.Wave)) > 1e-3)`);
    expect(out.trim()).toBe('(test_bci (tap -0.1))|(test_bci (tap -0.35))|hyperion_link.rx2tx|1\nhyperion_link.rx2tx, hyperion_link_a1.rx2tx|(test_bci (tap -0.35))|1');
  }, 60000);
});

describe("the IBIS file's analog buffers (M583)", () => {
  const IBS = `[IBIS Ver] 7.1
[Component] chip
[Package]
| typ min max
R_pkg 0.2 0.1 0.3
L_pkg 1n 0.8n 1.2n
C_pkg 0.3p 0.2p 0.4p
[Model] serdes_tx
Model_type Output
C_comp 0.6p 0.5p 0.7p
[Voltage Range] 1.0 0.95 1.05
[Pull-down]
| V I(typ) I(min) I(max)
-1.0 -25m -20m -30m
0.0 0 0 0
1.0 25m 20m 30m
[Pull-up]
-1.0 25m 20m 30m
0.0 0 0 0
1.0 -25m -20m -30m
[Ramp]
dV/dt_r 0.36/12p 0.36/15p 0.36/9p
[Algorithmic Model]
Executable Linux_gcc_64 libtx64.so tx.ami
[End Algorithmic Model]
[Model] serdes_rx
Model_type Input
C_comp 0.4p NA NA
[Voltage Range] 1.0 0.95 1.05
[GND Clamp]
0.0 0 0 0
1.0 20m 20m 20m
[POWER Clamp]
0.0 0 0 0
1.0 20m 20m 20m
[End]
`;
  it('reads a driver, a receiver and the package at each corner', () => {
    const tx = readAnalog(IBS, 'serdes_tx')!, rx = readAnalog(IBS, 'serdes_rx', 'min')!;
    expect(tx.rs).toBeCloseTo(40, 9); expect(tx.cComp).toBeCloseTo(0.6e-12, 20); expect(tx.rise).toBeCloseTo(20e-12, 20);
    expect([tx.rPkg, tx.lPkg, tx.cPkg]).toEqual([0.2, 1e-9, 0.3e-12]);
    expect(readAnalog(IBS, 'serdes_tx', 'max')!.rs).toBeCloseTo(100 / 3, 9);
    expect(rx.rt).toBeCloseTo(25, 9); expect(rx.cComp).toBeCloseTo(0.4e-12, 20);   // NA at min falls back to typ
    expect(readAnalog(IBS, 'nothing')).toBeNull();
    expect(ibisNum('3.3M')).toBe(3.3e6); expect(ibisNum('50m')).toBeCloseTo(0.05, 12); expect(ibisNum('NA')).toBeNaN();
  });
  it('an ideal end changes nothing; pads, packages and slow edges cut the high frequencies', () => {
    const ideal = { type: '', corner: 'typ', rs: 50, rt: 50, cComp: 0, rPkg: 0, lPkg: 0, cPkg: 0, rise: 0, notes: [] };
    for (const f of [0, 1e9, 2e10]) { expect(txGain(ideal, f)[0]).toBeCloseTo(1, 9); expect(rxGain(ideal, f)[0]).toBeCloseTo(1, 9); }
    const tx = readAnalog(IBS, 'serdes_tx')!, rx = readAnalog(IBS, 'serdes_rx')!, mag = (z: number[]) => Math.hypot(z[0], z[1]);
    expect(txGain(tx, 0)[0]).toBeCloseTo(100 / 90.2, 9);         // 40 ohms and the package's 0.2 into 50
    expect(rxGain(rx, 0)[0]).toBeCloseTo((2 * 25.2 / 75.2) * (25 / 25.2), 9);   // 25 ohms (behind 0.2) at the end of a 50-ohm line
    expect(mag(txGain(tx, 2e10))).toBeLessThan(0.8 * mag(txGain(tx, 1e9)));
    const h = [1e12, ...new Array(2047).fill(0)], y = throughFrontEnds(h, 1e-12, tx, rx);
    expect(y.reduce((a, b) => a + b, 0) / (1e12 * (100 / 90.2) * (2 * 25 / 75.2))).toBeCloseTo(1, 6);   // the DC gain kept (the package's ringing settled)
    expect(Math.max(...y)).toBeLessThan(0.2e12);                  // the edge spread over ~20 ps
  });
  it('amiModel from an .ibs file carries the buffer and the flows use it', () => {
    let out = '';
    const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics(), files: new FileStore() });
    const files = (lab.host as { files: FileStore }).files;
    files.load('chip.ibs', { bytes: new TextEncoder().encode(IBS) });
    files.load('tx.ami', { bytes: new TextEncoder().encode(AMI) });
    lab.run(`m = amiModel('chip.ibs', 'serdes_tx', 'Folder', '/opt/models', 'Corner', 'max'); n = amiModel('chip.ibs', 'serdes_tx', 'Folder', '/opt/models', 'Analog', 0);
fprintf('%.4f %.0f %d\\n', m.Analog.Driver, m.Analog.Rise * 1e12, isfield(n, 'Analog'))`);
    expect(out.trim()).toBe('33.3333 15 0');
    expect(() => lab.run("amiModel('chip.ibs', 'serdes_tx', 'Folder', '/x', 'Corner', 'fast')")).toThrow(/typ/);
    setNative(fake(tapOf));
    const info = ami.readAmi(AMI), tx: ami.Model = { name: 'tx', file: { name: 't.so', path: '/t.so' }, params: ami.paramString(info, new Map()), info, analog: readAnalog(IBS, 'serdes_tx')! };
    const h = [1e12, ...new Array(2047).fill(0)], f = ami.flow(h, 1e-12, 8e-12, tx, null, null);
    expect(f.h.reduce((a, b) => a + b, 0) / (1e12 * 100 / 90.2)).toBeCloseTo(1, 6);
    expect(f.messages[0]).toMatch(/tx analog \(typ\): driver 40\.0 ohms, C_comp 0\.600 pF, edge 20\.0 ps/);
  });
});
