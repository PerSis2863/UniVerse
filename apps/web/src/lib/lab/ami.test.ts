import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as ami from './ami';
import * as si from './si';
import { b64ToF64, f64ToB64, setNative, type Native } from './native';
import { Lab } from './interp';
import { Graphics } from './plot';
import { FileStore } from './files';
import './sciences';

const AMI = fs.readFileSync(path.join(__dirname, 'fixtures', 'test-ffe.ami'), 'utf8');
afterEach(() => setNative(null));

/** A stand-in for the computer app: the test model's two-tap FFE done in JavaScript. */
const fake = (tapOf: (p: string) => number): Native => (_op, body) => {
  const b = body as { params: string; impulse: string; dt: number; ui: number; wave?: string };
  const tap = tapOf(b.params), spu = Math.round(b.ui / b.dt), k = 1 / (1 + 2 * Math.abs(tap));
  const ffe = (x: number[]) => x.map((v, i) => k * ((1 + tap) * v + tap * (i >= spu ? x[i - spu] : 0)));
  const out: Record<string, unknown> = { ok: true, impulse: f64ToB64(ffe(b64ToF64(b.impulse))), paramsOut: '(test_tx)', message: 'fake', hasGetWave: true };
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
    expect(() => ami.session({ name: 't', file: { name: 't.dll', path: '/x/t.dll' }, params: '(t)', info: ami.readAmi(AMI) }, [1, 0], 1, 1)).toThrow(/computer app/);
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

  // The real thing: the desktop app's runner loads the compiled test model (needs desktop/hyperion's koffi and gcc).
  const desk = path.resolve(__dirname, '../../../../../desktop/hyperion');
  const lib = path.join(os.tmpdir(), 'hyperion-ami-vitest.so');
  let real = process.platform === 'linux' && fs.existsSync(path.join(desk, 'node_modules', 'koffi'));
  if (real) try { execFileSync('gcc', ['-shared', '-fPIC', '-O2', path.join(desk, 'test', 'ami-test-model.c'), '-o', lib]); } catch { real = false; }
  it.skipIf(!real)('runs a real compiled model through the computer app\'s runner, end to end', () => {
    // A synchronous bridge like the app's: the request handed to ami-host.js's session in a Node process.
    setNative((_op, body) => {
      const script = `const h = require(${JSON.stringify(path.join(desk, 'ami-host.js'))}), a = require(${JSON.stringify(path.join(desk, 'ami.js'))});
const req = JSON.parse(require('fs').readFileSync(0, 'utf8')), p = a.prepare(req.executable);
process.stdout.write(JSON.stringify(p.error ? { ok: false, error: p.error } : h.session({ ...req, file: p.file })));`;
      const r = spawnSync(process.execPath, ['-e', script], { input: JSON.stringify(body), maxBuffer: 1e9 });
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
