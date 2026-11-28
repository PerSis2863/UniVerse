import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as I from './ibis';
import { parseRaw } from './spice-raw';
import { Lab } from './interp';
import { FileStore } from './files';
import { toMat, type Struct } from './values';
import './mixsig-lab';

// M570: the IBIS buffer's tables are what SPICE gives for the same transistors (ngspice, where it's installed), and
// the file has every section at three corners.
let hasNgspice = true;
try { execFileSync('ngspice', ['--version'], { stdio: 'ignore' }); } catch { hasNgspice = false; }
const s = I.BUFFER0;
const deck = (body: string) => `* Hyperion buffer
VDD vdd 0 ${s.vdd}
M1 pad g 0 0 nch W=${s.n.w} L=${s.n.l}
M2 pad g vdd vdd pch W=${s.p.w} L=${s.p.l}
.model nch nmos level=1 kp=${s.n.kp} vto=${s.n.vto} lambda=${s.n.lambda} is=1e-60
.model pch pmos level=1 kp=${s.p.kp} vto=${-s.p.vto} lambda=${s.p.lambda} is=1e-60
${body}
.end
`;
function spice(name: string, text: string) {
  const dir = mkdtempSync(join(tmpdir(), 'hyp-ibis-'));
  writeFileSync(join(dir, `${name}.cir`), text);
  execFileSync('ngspice', ['-b', '-r', `${name}.raw`, `${name}.cir`], { cwd: dir, stdio: 'ignore' });
  return parseRaw(new Uint8Array(readFileSync(join(dir, `${name}.raw`))))[0];
}

describe('Hyperion IBIS buffers (M570)', () => {
  it.skipIf(!hasNgspice)('the pulldown and pullup match ngspice on the same transistors', () => {
    const typ = I.corner(s, 'typ');
    for (const [gate, name] of [[s.vdd, 'pd'], [0, 'pu']] as const) {
      const p = spice(name, deck(`VG g 0 ${gate}\nVP pad 0 0\n.dc VP -1.35 3.15 0.15`));
      const v = p.data[p.vars.indexOf('v(v-sweep)')].re, i = p.data[p.vars.indexOf('i(vp)')].re;
      v.forEach((vv, k) => expect(I.pinCurrent(typ, vv, gate, false)).toBeCloseTo(-i[k], 7)); // to 0.1 µA
    }
  });
  it.skipIf(!hasNgspice)('the rising edge into 50 Ω matches ngspice’s transient', () => {
    // the input falls from Vdd over 100 ps at 0.2 ns (the inverter's output rises), the pad loaded by 50 Ω and C_comp
    const p = spice('tr', deck(`VG g 0 PWL(0 ${s.vdd} 0.2n ${s.vdd} 0.3n 0)\nRL pad 0 ${s.rload}\nCC pad 0 ${s.ccomp}\n.tran 1p 2n`));
    const t = p.data[0].re, v = p.data[p.vars.indexOf('v(pad)')].re;
    const ours = I.transient(s, 'typ', true, 0), at = (tt: number[], vv: number[], x: number) => { for (let k = 1; k < vv.length; k++) if (vv[k - 1] < x && vv[k] >= x) return tt[k - 1] + (x - vv[k - 1]) / (vv[k] - vv[k - 1]) * (tt[k] - tt[k - 1]); return NaN; };
    const top = ours.v[ours.v.length - 1];
    expect(v[v.length - 1]).toBeCloseTo(top, 3); // the same settled level
    for (const f of [0.2, 0.5, 0.8]) expect(at(ours.t, ours.v, f * top)).toBeCloseTo(at(t, v, f * top), 11); // within 10 ps
  });
  it('writes every IBIS section, with the slow corner slower and weaker than the fast one', () => {
    const f = I.ibisFile('hyp', s, { ami: 'hyp.ami', date: '2026-11-27' });
    for (const k of ['[IBIS Ver]   7.1', '[Component]  hyp', '[Model] hyp_buf', '[Pulldown]', '[Pullup]', '[GND Clamp]', '[POWER Clamp]', '[Ramp]', '[Rising Waveform]', '[Falling Waveform]', 'Executable Linux_gcc_64 hyp_linux64.so hyp.ami', '[End]']) expect(f).toContain(k);
    expect(f.match(/\[Rising Waveform\]/g)).toHaveLength(2);
    const at = (c: I.Corner) => I.pinCurrent(I.corner(s, c), 0.9, I.corner(s, c).vdd, false);
    expect(at('max')).toBeGreaterThan(at('typ')); expect(at('typ')).toBeGreaterThan(at('min'));
    const r = (c: I.Corner) => I.ramp(s, c).rise.dt;
    expect(r('min')).toBeGreaterThan(r('typ')); expect(r('typ')).toBeGreaterThan(r('max'));
    // the clamps: no current inside the rails, a diode's worth past them
    const t = I.ivTables(s, 'typ');
    expect(Math.abs(t.gndClamp.find((x) => Math.abs(x[0] - 0.9) < 0.05)![1])).toBeLessThan(1e-9);
    expect(t.gndClamp[0][1]).toBeLessThan(-0.01);
  });
  it('ibisbuffer and amigen write the tables', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    l.run("b = ibisbuffer('pad18', 'Vdd', 1.8, 'Wn', 60e-6); amigen('hyptx', 'Tx', 'FFE', [-0.1 0.8 -0.1]);");
    expect(files.text('pad18.ibs')).toContain('[Pulldown]');
    expect(toMat((l.vars.get('b') as Struct).f.get('RiseTime')!).d[0]).toBeGreaterThan(10e-12);
    const ibs = files.text('hyptx.ibs');
    expect(ibs).toContain('[Rising Waveform]'); expect(ibs).toContain('hyptx.ami');
    expect(() => l.run("ibisbuffer('x', 'Vt', 3)")).toThrow(/threshold/);
  });
});
