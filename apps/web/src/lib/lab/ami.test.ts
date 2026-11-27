import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as ami from './ami';
import * as si from './si';
import { ibisNum, readAnalog, rxGain, throughFrontEnds, txGain, type Analog } from './ibis-analog';
import { analogImpulse, arrivalResponse, fixtureCurrent, idealEnd, iv, switching } from './ibis-sim';
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
    expect(out.trim()).toBe('(test_bci (tap -0.1))|(test_bci (tap -0.35))|hyperion_link.rx2tx|1\na1/hyperion_link.rx2tx, hyperion_link.rx2tx|(test_bci (tap -0.35))|1');
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
1.0 -20m -20m -20m
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
    const ideal = idealEnd(50, 'tx');
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
    lab.run(`S = sparamLine(1e8:1e8:4e10, 'Length', 0.1); m = amiModel('chip.ibs', 'serdes_tx', 'Folder', '/opt/models');
r = amiSimulate(S, 10e9, 'TxModel', m, 'Flow', 'statistical'); m.Analog = []; m = rmfield(m, 'Analog'); p = amiSimulate(S, 10e9, 'TxModel', m, 'Flow', 'statistical');
fprintf('%d %d %d\\n', isfield(r, 'ImpulseRise'), isfield(p, 'ImpulseRise'), max(abs(r.ImpulseRise - r.ImpulseFall)) > 0)
disp(r.Messages)`);
    const [l1, ...rest] = out.trim().split('\n').slice(1);
    expect(l1).toBe('1 0 1');
    expect(rest.join('\n')).toMatch(/tx analog \(typ\): driver 40\.0 ohms near its rails, C_comp 0\.600 pF, edges 20\.0 \/ 20\.0 ps[\s\S]*edges differ by/);
  });
  it('M586: the waveform tables reach m.Analog; a 4-port runs each leg through its own buffer, crosstalk included', () => {
    let out = '';
    const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics(), files: new FileStore() });
    const files = (lab.host as { files: FileStore }).files, wave = (vf: number) => Array.from({ length: 21 }, (_, i) => { const ku = Math.min(1, i / 15), v = (vf / 50 + ku / 40) / (1 / 40 + 1 / 50); return `${i}p ${v.toFixed(6)} NA NA`; }).join('\n');
    files.load('chip.ibs', { bytes: new TextEncoder().encode(IBS.replace('[Ramp]', `[Rising Waveform]\nR_fixture 50\nV_fixture 0\n${wave(0)}\n[Rising Waveform]\nR_fixture 50\nV_fixture 1\n${wave(1)}\n[Ramp]`)) });
    files.load('tx.ami', { bytes: new TextEncoder().encode(AMI) });
    const f = Array.from({ length: 400 }, (_, k) => (k + 1) * 1e8), l = si.lineS(f, { length: 0.1, z0: 50, dk: 3.7, df: 0.01, width: 127e-6, zref: 50 }), Z: si.C = [0, 0];
    files.load('pair.s4p', { bytes: new TextEncoder().encode(si.writeTouchstone(f, f.map((_, k) => [[l.s11[k], Z, l.s21[k], Z], [Z, l.s11[k], Z, l.s21[k]], [l.s21[k], Z, l.s11[k], Z], [Z, l.s21[k], Z, l.s11[k]]]))) });
    setNative(fake(tapOf));
    lab.run(`m = amiModel('chip.ibs', 'serdes_tx', 'Folder', '/opt/models'); S = sparameters('pair.s4p');
r = amiSimulate(S, 10e9, 'TxModel', m, 'Flow', 'statistical', 'Crosstalk', [0.05 0]);
fprintf('%d %d %d\\n', size(m.Analog.RisingK, 2), isfield(m.Analog, 'FallingK'), size(r.AggressorsRx, 1))
disp(r.Messages)`);
    const [l1, ...rest] = out.trim().split('\n');
    expect(l1).toBe('3 0 1');
    expect(rest.join('\n')).toMatch(/edges from its waveform tables[\s\S]*Each leg of the differential pair/);
  });
});

describe('the buffers in time: non-linear curves and echoes (M585)', () => {
  const line = (r: number) => [[-10, -10 / r], [10, 10 / r]];
  const end = (a: Partial<Analog>): Analog => ({ ...idealEnd(50, 'tx'), pu: [], pd: [], ...a });
  /** A lossless matched line delayed by d samples. */
  const ports = (n: number, d: number) => { const z = new Array(n).fill(0), s21 = [...z]; s21[d] = 1; return { s11: z, s22: z, s12: s21, s21 }; };
  it('an ideal pair on a matched line gives the line itself, the same on both edges', () => {
    const r = analogImpulse(ports(64, 5), 64, 1e-12, 50, idealEnd(50, 'tx'), idealEnd(50, 'rx'));
    expect(r.h[5] * 1e-12).toBeCloseTo(1, 9);
    expect(r.h.reduce((a, b) => a + Math.abs(b), 0) * 1e-12).toBeCloseTo(1, 9);
    r.rise.forEach((v, k) => expect(v * 1e-12).toBeCloseTo(r.fall[k] * 1e-12, 9));
  });
  it('mismatched ends echo: each round trip brings back the two reflections multiplied', () => {
    // a 25-ohm driver (reflects -1/3) and a 100-ohm termination (+1/3): arrivals at d, 3d, 5d …
    const tx = end({ pu: line(-25), pd: line(25) }), rx = end({ gc: line(200), pc: line(-200) });
    const r = analogImpulse(ports(64, 6), 64, 1e-12, 50, tx, rx), first = r.h[6] * 1e-12;
    expect(first).toBeCloseTo((4 / 3) * (4 / 3), 9);               // (1 − Γs)(1 + ΓL) against a matched pair's 1
    expect(r.h[18] / r.h[6]).toBeCloseTo(-1 / 9, 9);
    expect(r.h[30] / r.h[6]).toBeCloseTo(1 / 81, 9);
    expect(Math.abs(r.h[12] * 1e-12)).toBeLessThan(1e-9);
  });
  it('an uneven driver: a weak pull-up rises later than its strong pull-down falls; a table carried past its ends', () => {
    const tx = end({ pu: line(-100), pd: line(25), rise: 40e-12, fall: 40e-12 }), r = analogImpulse(ports(160, 4), 160, 1e-12, 50, tx, idealEnd(50, 'rx'));
    const half = (x: number[]) => { const tot = x.reduce((a, b) => a + b, 0); let acc = 0; return x.findIndex((v) => (acc += v) >= tot / 2); };
    const area = (x: number[]) => x.reduce((a, b) => a + b, 0);
    expect(area(r.rise) / area(r.fall)).toBeCloseTo(1, 9);         // both edges between the same two levels
    expect(half(r.rise) - half(r.fall)).toBeGreaterThanOrEqual(8);
    const sat = [[-0.2, 8e-3], [0, 0], [0.2, -8e-3], [10, -9e-3]];
    expect(iv(sat, 20)).toBeCloseTo(-9e-3 - 1e-3 * (10 / 9.8), 9);
    expect(iv(sat, -0.4)).toBeCloseTo(16e-3, 9);
  });
  it('a slow edge and a pad spread the response; the package and the pad hold its area', () => {
    const tx = end({ pu: line(-50), pd: line(50), rise: 30e-12, fall: 30e-12, cComp: 1e-12, lPkg: 0.5e-9, cPkg: 0.2e-12 });
    const r = analogImpulse(ports(512, 4), 512, 1e-12, 50, tx, idealEnd(50, 'rx'));
    expect(Math.max(...r.h) * 1e-12).toBeLessThan(0.06);
    expect(r.h.reduce((a, b) => a + b, 0) * 1e-12).toBeCloseTo(1, 4);
  });
});

describe('waveform tables, two-leg pairs, crosstalk echoes, block sums (M586)', () => {
  const line = (r: number) => [[-10, -10 / r], [10, 10 / r]];
  const end = (a: Partial<Analog>): Analog => ({ ...idealEnd(50, 'tx'), pu: [], pd: [], ...a });
  const delayed = (n: number, d: number) => { const s = new Array(n).fill(0); s[d] = 1; return s; };
  it('the block sums give what a plain recursion gives on long, dense responses with mismatched ends', () => {
    // resistive ends: a 30-ohm driver stepping 0 → 1 V, an 80-ohm load; responses 700 samples long (past the blocks)
    const n = 700, z = 50, rs = 30, rt = 80, gs = (rs - z) / (rs + z), gl = (rt - z) / (rt + z);
    const s11 = Array.from({ length: n }, (_, k) => (k ? 0.05 * Math.exp(-k / 150) * Math.sin(k / 5) : 0));
    const s22 = Array.from({ length: n }, (_, k) => (k ? -0.04 * Math.exp(-k / 120) * Math.cos(k / 9) : 0));
    const s21 = Array.from({ length: n }, (_, k) => (k >= 7 ? (0.9 * Math.exp(-(k - 7) / 30)) / 30 : 0));
    const a1 = new Array(n).fill(0), a2 = new Array(n).fill(0), v2 = new Array(n).fill(0);
    for (let t = 0; t < n; t++) {
      let b1 = 0, b2 = 0;
      for (let k = 1; k <= t; k++) { b1 += s11[k] * a1[t - k] + s21[k] * a2[t - k]; b2 += s22[k] * a2[t - k] + s21[k] * a1[t - k]; }
      a1[t] = z / (rs + z) + gs * b1; b2 += 0; a2[t] = gl * b2; v2[t] = (1 + gl) * b2;
    }
    const r = analogImpulse({ s11, s12: s21, s21, s22 }, n, 1e-12, z, end({ pu: line(-rs), pd: line(rs) }), end({ gc: line(rt) }));
    r.rise.forEach((v, k) => expect(v * 1e-12 * 0.5).toBeCloseTo(v2[k] - (k ? v2[k - 1] : 0), 10));
  });
  it('the .ibs file\'s waveform tables give the driver\'s switching; the edge follows them', () => {
    // a 40-ohm driver whose pull-up turns on along a 30 ps ramp, into 50 ohms to ground and to the supply
    const r = 40, T = 30e-12, ku = (t: number) => Math.min(1, t / T);
    const V = (t: number, vf: number) => (vf / 50 + ku(t) / r) / (1 / r + 1 / 50);
    const rows = (vf: number) => Array.from({ length: 41 }, (_, i) => [i * 1e-12, V(i * 1e-12, vf)]);
    const a = end({ pu: line(-r), pd: line(r) }), k = switching(a, [{ r: 50, v: 0, rows: rows(0) }, { r: 50, v: 1, rows: rows(1) }])!;
    for (const row of k) { expect(row[1]).toBeCloseTo(ku(row[0]), 6); expect(row[2]).toBeCloseTo(1 - ku(row[0]), 6); }
    const one = switching(a, [{ r: 50, v: 0, rows: rows(0) }])!;
    expect(one[Math.floor(one.length / 2)][1]).toBeCloseTo(ku(one[Math.floor(one.length / 2)][0]), 6);
    const table = (vf: number) => rows(vf).map(([t, v]) => `${(t * 1e12).toFixed(0)}p ${v.toFixed(6)} ${v.toFixed(6)} ${v.toFixed(6)}`).join('\n');
    const ibs = `[Component] c\n[Model] d\nModel_type Output\n[Voltage Range] 1 1 1\n[Pull-down]\n-1 -25m -25m -25m\n1 25m 25m 25m\n[Pull-up]\n-1 25m 25m 25m\n1 -25m -25m -25m\n[Rising Waveform]\nR_fixture 50\nV_fixture 0\n${table(0)}\n[Rising Waveform]\nR_fixture 50\nV_fixture 1.0\n${table(1)}\n[End]\n`;
    const an = readAnalog(ibs, 'd')!;
    expect(an.kr!.length).toBeGreaterThan(40); expect(an.kf).toBeUndefined();
    expect(an.notes.join()).toMatch(/rising edge from 2 \[Rising Waveform\] tables/);
    expect(held(an.kr!, 15e-12)).toBeCloseTo(0.5, 5);
    // the table's 30 ps ramp against no ramp at all: the edge spread, its area the same
    const p = { s11: new Array(128).fill(0), s22: new Array(128).fill(0), s12: delayed(128, 3), s21: delayed(128, 3) };
    const slow = analogImpulse(p, 128, 1e-12, 50, an, idealEnd(50, 'rx')).rise, fast = analogImpulse(p, 128, 1e-12, 50, { ...an, kr: undefined }, idealEnd(50, 'rx')).rise;
    expect(Math.max(...slow)).toBeLessThan(0.1 * Math.max(...fast));
    expect(slow.reduce((x, y) => x + y, 0) / fast.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 5);
  });
  function held(k: number[][], t: number) { const i = k.findIndex((r) => r[0] >= t); const [a, b] = [k[i - 1], k[i]]; return a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]); }
  it('a differential pair: each leg its own buffer, so an uneven driver\'s two edges come out alike', () => {
    const n = 160, z = new Array(n).fill(0), d = delayed(n, 4);
    // two uncoupled lines: port 1 → 3 and port 2 → 4
    const S = [[z, z, d, z], [z, z, z, d], [d, z, z, z], [z, d, z, z]];
    const ideal = analogImpulse(S, n, 1e-12, 50, idealEnd(50, 'tx'), idealEnd(50, 'rx'));
    expect(ideal.h[4] * 1e-12).toBeCloseTo(1, 9);
    const tx = end({ pu: line(-100), pd: line(25), rise: 40e-12, fall: 40e-12 });
    const pair = analogImpulse(S, n, 1e-12, 50, tx, idealEnd(50, 'rx')), single = analogImpulse({ s11: z, s22: z, s12: d, s21: d }, n, 1e-12, 50, tx, idealEnd(50, 'rx'));
    const gap = (r: { rise: number[]; fall: number[] }) => Math.max(...r.rise.map((v, k) => Math.abs(v - r.fall[k])));
    expect(gap(single)).toBeGreaterThan(0.01 / 1e-12);
    expect(gap(pair)).toBeLessThan(1e-9 / 1e-12);
  });
  it('a neighbour\'s near-end wave echoes between mismatched ends', () => {
    const n = 64, z = new Array(n).fill(0), d = delayed(n, 6), p = { s11: z, s22: z, s12: d, s21: d };
    expect(arrivalResponse(p, n, 1e-12, 50, idealEnd(50, 'tx'), idealEnd(50, 'rx')).map((v) => v * 1e-12).slice(0, 20)).toEqual(expect.arrayContaining([expect.closeTo(1, 9)]));
    const g = arrivalResponse(p, n, 1e-12, 50, end({ pu: line(-25), pd: line(25) }), end({ gc: line(200), pc: line(-200) }));
    expect(g[0] * 1e-12).toBeCloseTo(4 / 3, 6);                  // 1 + ΓL
    expect(g[12] / g[0]).toBeCloseTo(-1 / 9, 6);                  // ΓL·Γs after one round trip
    expect(Math.abs(g[6] * 1e-12)).toBeLessThan(1e-9);
  });
});

describe('M587: the fixture and package taken out, the legs solved together, each neighbour its own echoes', () => {
  const line = (r: number) => [[-10, -10 / r], [10, 10 / r]];
  const end = (a: Partial<Analog>): Analog => ({ ...idealEnd(50, 'tx'), pu: [], pd: [], ...a });
  const delayed = (n: number, d: number) => { const s = new Array(n).fill(0); s[d] = 1; return s; };
  it('the fixture current: a resistor alone, a capacitor across it, a coil in series', () => {
    const h = 1e-12, V = Array.from({ length: 50 }, (_, i) => 0.01 * i);
    fixtureCurrent({ r: 50, v: 1, rows: [] }, V, h).forEach((i, n) => expect(i).toBeCloseTo((1 - V[n]) / 50, 9));
    const c = fixtureCurrent({ r: 50, v: 1, rows: [], c: 1e-12 }, V, h);
    for (let n = 2; n < 50; n++) expect(c[n]).toBeCloseTo((1 - V[n]) / 50 - 1e-12 * 0.01 / h, 6);
    // with L_fixture: V_fixture − R·i − L·di/dt is the die's voltage (backward Euler's own difference)
    const l = fixtureCurrent({ r: 50, v: 1, rows: [], l: 1e-9 }, V, h);
    for (let n = 1; n < 50; n++) expect(1 - 50 * l[n] - (1e-9 * (l[n] - l[n - 1])) / h).toBeCloseTo(V[n], 6);
  });
  it('a driver measured through a fixture\'s coil and capacitor and a package: its switching recovered', () => {
    // the "measurement": a 40-ohm driver whose pull-up turns on over 30 ps, its die through R_dut, L_dut, C_dut,
    // L_fixture, C_fixture into 50 ohms to V_fixture, integrated finely (RK4 at 0.01 ps)
    const r = 40, T = 30e-12, ku = (t: number) => Math.min(1, Math.max(0, t / T)), P = { rd: 0.5, ld: 0.4e-9, cd: 0.3e-12, l: 1e-9, c: 0.5e-12 };
    const measure = (vf: number) => {
      const f = (t: number, [i, vb, j, vc]: number[]) => [(ku(t) - (r + P.rd) * i - vb) / P.ld, (i - j) / P.cd, (vb - vc) / P.l, (j - (vc - vf) / 50) / P.c];
      const i0 = -vf / (r + P.rd + 50);
      let y = [i0, vf + 50 * i0, i0, vf + 50 * i0];
      const k = 1e-14, rows: number[][] = [];
      for (let s = 0; s <= 8000; s++) {
        const t = s * k;
        if (s % 50 === 0) rows.push([t, ku(t) - r * y[0]]);
        const a = f(t, y), b = f(t + k / 2, y.map((v, q) => v + (k / 2) * a[q])), c = f(t + k / 2, y.map((v, q) => v + (k / 2) * b[q])), d = f(t + k, y.map((v, q) => v + k * c[q]));
        y = y.map((v, q) => v + (k / 6) * (a[q] + 2 * b[q] + 2 * c[q] + d[q]));
      }
      return rows;
    };
    const a = end({ pu: line(-r), pd: line(r) }), w = [{ r: 50, v: 0, rows: measure(0), ...P }, { r: 50, v: 1, rows: measure(1), ...P }];
    const err = (k: number[][]) => Math.max(...k.filter((x) => x[0] > 2e-12).map((x) => Math.abs(x[1] - ku(x[0]))));
    expect(err(switching(a, w)!)).toBeLessThan(0.03);
    expect(err(switching(a, w.map((x) => ({ r: x.r, v: x.v, rows: x.rows })))!)).toBeGreaterThan(0.15);   // what M586 did
    const ibs = `[Model] d\nModel_type Output\n[Voltage Range] 1 1 1\n[Pull-down]\n-1 -25m -25m -25m\n1 25m 25m 25m\n[Pull-up]\n-1 25m 25m 25m\n1 -25m -25m -25m\n${w.map((x) => `[Rising Waveform]\nR_fixture 50\nV_fixture ${x.v}\nL_fixture 1nH\nC_fixture 0.5pF\nR_dut 0.5\nL_dut 0.4nH\nC_dut 0.3pF\n${x.rows.map(([t, v]) => `${(t * 1e12).toFixed(1)}p ${v.toFixed(7)} NA NA`).join('\n')}`).join('\n')}\n[End]\n`;
    expect(err(readAnalog(ibs, 'd')!.kr!)).toBeLessThan(0.03);
  });
  it('the two legs coupled at the same end are solved together: the answer does not depend on which leg comes first', () => {
    const n = 120, z = new Array(n).fill(0), d5 = delayed(n, 5), d6 = delayed(n, 6), k = [0.2, ...new Array(n - 1).fill(0)];
    // legs 5 and 6 samples long, coupled at the driven end with no delay; the same network with the legs listed the other way
    const S = [[z, k, d5, z], [k, z, z, d6], [d5, z, z, z], [z, d6, z, z]], W = [[z, k, d6, z], [k, z, z, d5], [d6, z, z, z], [z, d5, z, z]];
    const tx = end({ pu: line(-30), pd: line(30), rise: 20e-12, fall: 20e-12 }), rx = end({ ...idealEnd(50, 'rx'), gc: line(140), pc: line(-140) });
    const a = analogImpulse(S, n, 1e-12, 50, tx, rx).rise, b = analogImpulse(W, n, 1e-12, 50, tx, rx).rise;
    expect(Math.max(...a.map((v, q) => Math.abs(v - b[q])))).toBeLessThan(1e-7 * Math.max(...a.map(Math.abs)));
  });
  it('a neighbour beside one leg echoes along that leg\'s own path; a neighbouring pair along both', () => {
    const n = 64, z = new Array(n).fill(0), d6 = delayed(n, 6), d7 = delayed(n, 7);
    const S = [[z, z, d6, z], [z, z, z, d7], [d6, z, z, z], [z, d7, z, z]];   // the legs 6 and 7 samples long
    const ideal = [0, 1, -1].map((s) => arrivalResponse(S, n, 1e-12, 50, idealEnd(50, 'tx'), idealEnd(50, 'rx'), s as 0 | 1 | -1)[0] * 1e-12);
    ideal.forEach((v) => expect(v).toBeCloseTo(1, 9));          // an ideal end hears the same, wherever it comes from
    const tx = end({ pu: line(-25), pd: line(25) }), rx = end({ gc: line(200), pc: line(-200) });
    const [p, q] = [1, -1].map((s) => arrivalResponse(S, n, 1e-12, 50, tx, rx, s as 1 | -1));
    expect(Math.abs(p[12])).toBeGreaterThan(0.05 * Math.abs(p[0])); expect(Math.abs(p[14])).toBeLessThan(1e-9 * Math.abs(p[0]));
    expect(Math.abs(q[14])).toBeGreaterThan(0.05 * Math.abs(q[0])); expect(Math.abs(q[12])).toBeLessThan(1e-9 * Math.abs(q[0]));
  });
  it('\'Crosstalk\' takes a row per neighbour; each closes the eye more', () => {
    const pulse = { p: Array.from({ length: 400 }, (_, k) => Math.exp(-(((k - 100) / 12) ** 2))), cursor: 100 };
    const e: si.Eye = { rate: 28e9, spu: 16, pam4: false, order: 7, nsym: 1200, swing: 0.8, ffe: [], ffePre: 0, dfe: 0, rj: 0, dj: 0, noise: 0, ber: 1e-12, xtalk: [], seed: 1 };
    const h = [[], [[0.05, 0.05]], [[0.05, 0.05], [0.05, 0.05]]].map((x) => si.eye(pulse, { ...e, xtalk: x as si.Eye['xtalk'] }).heightBest);
    expect(h[1]).toBeLessThan(h[0]); expect(h[2]).toBeLessThan(h[1]);
    let out = '';
    const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics(), files: new FileStore() });
    expect(() => lab.run("S = sparamLine((1:100)*1e8, 'Length', 0.05); e = eyeDiagram(S, 10e9, 'Crosstalk', [0.05 0 2]);")).toThrow(/side is 1/);
    lab.run("S = sparamLine((1:100)*1e8, 'Length', 0.05); a = eyeDiagram(S, 10e9, 'Crosstalk', [0.05 0.1]); b = eyeDiagram(S, 10e9, 'Crosstalk', [0.05 0.1; 0.05 0.1]); fprintf('%d\\n', b.Height < a.Height)");
    expect(out.trim()).toBe('1');
  });
});
