import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { FileStore } from './files';
import { toMat, type Struct, type Mat } from './values';
import { waits } from './wait';
import * as M from './mixsig';
import * as I from './ibis';
import { Graphics } from './plot';
import './mixsig-lab';

// M572: the whole path to a circuit simulator, for real where ngspice is installed: spicegen writes Hyperion's design
// as a netlist, cosim sends it (here the computer app's own simulators.js, run in a child process, stands in for the
// app's window), ngspice runs it, its raw file comes back, and its answer is Hyperion's.
const SIMS = fileURLToPath(new URL('../../../../../desktop/hyperion/simulators.js', import.meta.url));
let hasNgspice = true;
try { execFileSync('ngspice', ['--version'], { stdio: 'ignore' }); } catch { hasNgspice = false; }
afterEach(() => { waits.page = null; });
/** The computer app's simulate(), run for real, answering the way page-answers.ts does. */
const realApp = (kind: string, body: unknown) => {
  if (kind !== 'cosim') throw new Error(kind);
  const js = `const s = require(${JSON.stringify(SIMS)}); let out = ''; const b = JSON.parse(require('fs').readFileSync(0, 'utf8'));
s.simulate(b.id, b.files, b.top, (t) => { out += t; }).then((r) => process.stdout.write(JSON.stringify({ ...r, out })));`;
  return JSON.parse(execFileSync('node', ['-e', js], { input: JSON.stringify(body), maxBuffer: 100_000_000 }).toString());
};

describe('Hyperion and circuit simulators (M572)', () => {
  it.skipIf(!hasNgspice)('the PLL loop filter in ngspice has the impedance Hyperion designed', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    waits.page = realApp;
    l.run("p = plldesign(25e6, 2.4e9, 500e3, 'Kvco', 100e6, 'Icp', 1e-3); spicegen('loop.cir', p); r = cosim('ngspice', 'loop.cir');");
    const r = l.vars.get('r') as Struct, res = r.f.get('Results') as Struct;
    expect(toMat(r.f.get('Passed')!).d[0]).toBe(1);
    const f = toMat(res.f.get('frequency')!).d, z = res.f.get('v_out') as Mat;
    const d = M.pllDesign({ fref: 25e6, fout: 2.4e9, bandwidth: 500e3, kvco: 100e6, icp: 1e-3 });
    for (const k of [0, 50, 100, 150, f.length - 1]) {
      const [zr, zi] = M.zf(d, 2 * Math.PI * f[k]);
      expect(z.d[k] / zr).toBeCloseTo(1, 4); expect(z.im![k] / zi).toBeCloseTo(1, 4); // the netlist keeps 6 digits
    }
  }, 120_000);
  it.skipIf(!hasNgspice)('the output buffer in ngspice rises as ibisbuffer says', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    waits.page = realApp;
    l.run("spicegen('buf.cir', 'buffer', 'Wn', 50e-6); r = cosim('ngspice', 'buf.cir');");
    const res = (l.vars.get('r') as Struct).f.get('Results') as Struct, t = toMat(res.f.get('time')!).d, v = toMat(res.f.get('v_pad')!).d;
    const ours = I.transient({ ...I.BUFFER0, n: { ...I.BUFFER0.n, w: 50e-6 } }, 'typ', true, 0), top = ours.v[ours.v.length - 1];
    const cross = (tt: ArrayLike<number>, vv: ArrayLike<number>, x: number) => { for (let k = 1; k < vv.length; k++) if (vv[k - 1] < x && vv[k] >= x) return tt[k - 1] + (x - vv[k - 1]) / (vv[k] - vv[k - 1]) * (tt[k] - tt[k - 1]); return NaN; };
    expect(cross(t, v, 0.5 * top)).toBeCloseTo(cross(ours.t, ours.v, 0.5 * top), 11);
  }, 120_000);
  it.skipIf(!hasNgspice)('the Verification tab’s circuit example runs as written', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files, graphics: new Graphics() });
    waits.page = realApp;
    l.run(`p = plldesign(25e6, 2.4e9, 500e3, 'Kvco', 100e6, 'Icp', 1e-3);
spicegen('loop.cir', p)
r = cosim('ngspice', 'loop.cir');
f = r.Results.frequency; z = r.Results.v_out;
semilogx(real(f), 20*log10(abs(z))), grid on
xlabel('Frequency (Hz)'), ylabel('|Z| (dB ohm)'), title('The loop filter, from the circuit simulator')`);
    expect(toMat(l.vars.get('z')!).d.length).toBeGreaterThan(100);
  }, 120_000);
  it('writes netlists a Spectre user can read too', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    l.run("p = plldesign(25e6, 2.4e9, 500e3); spicegen('loop.scs', p, 'Spectre', true); spicegen('b.sp', 'buffer');");
    expect(files.text('loop.scs')).toMatch(/simulator lang=spice\nIPUMP 0 out DC 0 AC 1/);
    expect(files.text('b.sp')).toContain('.model nch nmos level=1');
    expect(() => l.run("spicegen('x.txt', p)")).toThrow(/name\.cir/);
  });
});
