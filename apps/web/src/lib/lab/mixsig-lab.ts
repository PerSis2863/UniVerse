import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { FileStore } from './files';
import { mat, num, str, toMat, type Mat, type Struct, type Value } from './values';
import * as M from './mixsig';
import { CodegenError, generate, type Cls, type Ty } from './codegen';
import { askPage, waits } from './wait';
import { parseRaw as rawPlots } from './spice-raw';
import { BUFFER0, corner, ibisFile, ivTables, ramp, transient, type BufferSpec } from './ibis';
import * as TS from './touchstone';

// Hyperion's mixed-signal design in the language (M568): plldesign, pllsim, pllnoise (a charge-pump PLL from its
// specification to lock and jitter), adcarch and dacarch (converter architectures with their mismatch; adcmetrics and
// inldnl are their testbench), prbs and serdes (a serial link with its equalisers, eye, bathtub and CDR), and two
// verification exports: dpigen (a function as C with a SystemVerilog DPI-C wrapper and a self-checking testbench)
// and amigen (an IBIS-AMI equaliser model: its .ami parameter file and the C of AMI_Init / AMI_GetWave / AMI_Close).

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: number[]) => mat(1, v.length, v);
const col = (v: number[]) => mat(v.length, 1, v);
const files = (lab: Lab) => { const s = (lab.host as { files?: unknown }).files; return s instanceof FileStore ? s : null; };
const wrap = <T,>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); } };
const struct = (f: [string, Value][]): Struct => ({ k: 'struct', f: new Map(f) });
const yes = (v: boolean) => ({ ...num(v ? 1 : 0), logical: true });
/** 'Name', value pairs from index `from` on, by lower-cased name; refuses names it doesn't know. */
function opts(a: Value[], from: number, names: string[], what: string) {
  const o = new Map<string, Value>();
  for (let i = from; i < a.length; i += 2) {
    if (a[i].k !== 'str') throw new LabError(`${what}: options come as 'Name', value pairs.`);
    const k = textOf(a[i]).toLowerCase();
    if (!names.includes(k)) throw new LabError(`${what}: no option '${textOf(a[i])}' (it takes ${names.map((n) => `'${n}'`).join(', ')}).`);
    if (i + 1 >= a.length) throw new LabError(`${what}: '${textOf(a[i])}' needs a value.`);
    o.set(k, a[i + 1]);
  }
  const n = (k: string) => (o.has(k) ? toMat(o.get(k)!).d[0] : undefined);
  const v = (k: string) => (o.has(k) ? [...toMat(o.get(k)!).d] : undefined);
  const t = (k: string) => (o.has(k) ? textOf(o.get(k)!) : undefined);
  const b = (k: string) => (o.has(k) ? !!toMat(o.get(k)!).d[0] : undefined);
  return { n, v, t, b, has: (k: string) => o.has(k), raw: (k: string) => o.get(k) };
}
const field = (s: Value | undefined, name: string, what: string) => {
  if (s?.k !== 'struct') throw new LabError(`${what}: the design from plldesign.`);
  const v = s.f.get(name); if (!v) throw new LabError(`${what}: the design has no ${name} (make it with plldesign).`);
  return toMat(v).d[0];
};
const designOf = (s: Value | undefined, what: string): M.PllDesign => {
  const f = (n: string) => field(s, n, what);
  return { fref: f('Fref'), fout: f('Fout'), bandwidth: f('Bandwidth'), phaseMargin: f('PhaseMargin'), kvco: f('Kvco'), icp: f('Icp'), n: f('N'), c1: f('C1'), c2: f('C2'), r2: f('R2'), crossover: f('Bandwidth'), margin: f('PhaseMargin') };
};
const logspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => 10 ** (Math.log10(a) + (Math.log10(b) - Math.log10(a)) * i / (n - 1)));

// ——— PLL ———
def('plldesign', (a, nout, lab) => {
  if (a.length < 3) throw new LabError("plldesign(fref, fout, bandwidth, 'PhaseMargin', 55, 'Kvco', 100e6, 'Icp', 1e-3): a charge-pump PLL's loop filter.");
  const o = opts(a, 3, ['phasemargin', 'kvco', 'icp'], 'plldesign');
  const d = wrap(() => M.pllDesign({ fref: toMat(a[0]).d[0], fout: toMat(a[1]).d[0], bandwidth: toMat(a[2]).d[0], phaseMargin: o.n('phasemargin') ?? 55, kvco: o.n('kvco') ?? 100e6, icp: o.n('icp') ?? 1e-3 }));
  const s = struct([['Fref', num(d.fref)], ['Fout', num(d.fout)], ['N', num(d.n)], ['Bandwidth', num(d.bandwidth)], ['PhaseMargin', num(d.margin)], ['Kvco', num(d.kvco)], ['Icp', num(d.icp)], ['C1', num(d.c1)], ['C2', num(d.c2)], ['R2', num(d.r2)]]);
  if (nout > 0) return [s];
  const f = logspace(d.bandwidth / 100, Math.min(d.fref / 2, d.bandwidth * 100), 300), b = M.pllBode(d, f);
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'semilogx', row(f), row(b.mag)); call(lab, 'yline', num(0), str('--')); call(lab, 'ylabel', str('Open-loop gain (dB)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`N = ${+d.n.toFixed(6)} · C1 = ${eng(d.c1)}F · C2 = ${eng(d.c2)}F · R2 = ${eng(d.r2)}Ω · margin ${d.margin.toFixed(1)}°`));
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'semilogx', row(f), row(b.phase)); call(lab, 'yline', num(-180), str('--')); call(lab, 'ylabel', str('Phase (°)')); call(lab, 'xlabel', str('Frequency (Hz)')); call(lab, 'grid', str('on'));
  return [];
});
const eng = (x: number) => { const p = [[1e-15, 'f'], [1e-12, 'p'], [1e-9, 'n'], [1e-6, 'µ'], [1e-3, 'm'], [1, ''], [1e3, 'k'], [1e6, 'M'], [1e9, 'G']] as const; let best: (typeof p)[number] = p[0]; for (const q of p) if (Math.abs(x) >= q[0]) best = q; return `${+(x / best[0]).toPrecision(3)} ${best[1]}`; };
def('pllsim', (a, nout, lab) => {
  const d = designOf(a[0], 'pllsim');
  const o = opts(a, 1, ['cycles', 'start', 'order', 'tolerance', 'leakage'], 'pllsim');
  const cycles = Math.round(o.n('cycles') ?? 400);
  if (!(cycles >= 20 && cycles <= 20000)) throw new LabError('pllsim: 20 to 20,000 reference periods.');
  const order = o.n('order'); if (order !== undefined && ![0, 1, 2, 3].includes(order)) throw new LabError("pllsim: 'Order' is the sigma-delta's, 0 to 3.");
  const r = wrap(() => M.pllSim(d, { cycles, f0: o.n('start'), mash: order as 0 | 1 | 2 | 3 | undefined, tol: o.n('tolerance'), leak: o.n('leakage') }));
  if (nout > 0) return [struct([['Time', col(r.t)], ['Vc', col(r.vc)], ['Frequency', col(r.fout)], ['PhaseError', col(r.phaseErr)], ['Modulus', col(r.nUsed)], ['LockTime', num(r.locked ? r.lockTime : NaN)], ['Locked', yes(r.locked)]])];
  const us = row(r.t.map((t) => t * 1e6));
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'plot', us, row(r.fout.map((f) => f / 1e6))); call(lab, 'yline', num(d.fout / 1e6), str('--')); call(lab, 'ylabel', str('Output (MHz)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(r.locked ? `Locked after ${(r.lockTime * 1e6).toFixed(2)} µs` : 'Not locked yet (more cycles, a wider bandwidth or a larger Kvco)'));
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'plot', us, row(r.vc)); call(lab, 'ylabel', str('Control voltage (V)')); call(lab, 'xlabel', str('Time (µs)')); call(lab, 'grid', str('on'));
  return [];
});
def('pllnoise', (a, nout, lab) => {
  const d = designOf(a[0], 'pllnoise');
  const f = a[1] && a[1].k === 'mat' ? [...toMat(a[1]).d] : logspace(1e3, Math.min(d.fref / 2, 100e6), 200);
  if (f.length < 2 || f.some((x, i) => !(x > 0) || (i && x <= f[i - 1]))) throw new LabError('pllnoise: offsets above 0 Hz, increasing.');
  const o = opts(a, a[1] && a[1].k === 'mat' ? 2 : 1, ['reference', 'vco', 'at', 'corner', 'floor', 'order'], 'pllnoise');
  const r = M.pllNoise(d, f, { refNoise: o.n('reference'), vcoNoise: o.n('vco'), vcoAt: o.n('at'), vcoCorner: o.n('corner'), floor: o.n('floor'), mash: o.n('order') });
  if (nout > 0) return [struct([['Offset', col(f)], ['Total', col(r.total)], ['Reference', col(r.ref)], ['VCO', col(r.vco)], ['SigmaDelta', col(r.sd)], ['Jitter', num(r.jitter)]])];
  call(lab, 'semilogx', row(f), row(r.total), str('k')); call(lab, 'hold', str('on'));
  call(lab, 'semilogx', row(f), row(r.ref), str('--')); call(lab, 'semilogx', row(f), row(r.vco), str('--'));
  const sd = r.sd.some(Number.isFinite); if (sd) call(lab, 'semilogx', row(f), row(r.sd.map((v) => (Number.isFinite(v) ? v : NaN))), str('--'));
  call(lab, 'hold', str('off')); call(lab, 'legend', ...[str('Total'), str('Reference'), str('VCO'), ...(sd ? [str('Sigma-delta')] : [])]);
  call(lab, 'xlabel', str('Offset (Hz)')); call(lab, 'ylabel', str('Phase noise (dBc/Hz)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`RMS jitter ${(r.jitter * 1e15).toFixed(0)} fs (${eng(f[0])}Hz to ${eng(f[f.length - 1])}Hz)`));
  return [];
});

// ——— Converters ———
def('adcarch', (a, nout) => {
  if (a.length < 3) throw new LabError("adcarch(x, 'SAR', bits, [lo hi], 'Offset', 0, 'Mismatch', 0, 'Gain', 0, 'Noise', 0, 'Seed', 1): 'Flash', 'SAR' or 'Pipeline'.");
  const x = toMat(a[0], 'The signal') as Mat, arch = textOf(a[1]).toLowerCase() as M.AdcArch, bits = Math.round(toMat(a[2]).d[0]);
  if (!['flash', 'sar', 'pipeline'].includes(arch)) throw new LabError("adcarch: the architecture is 'Flash', 'SAR' or 'Pipeline'.");
  if (!(bits >= 3 && bits <= 20)) throw new LabError('adcarch: 3 to 20 bits.');
  const range = a[3] && a[3].k === 'mat' ? toMat(a[3]).d : [-1, 1];
  if (!(range[1] > range[0])) throw new LabError('adcarch: a range [lo hi] with lo < hi.');
  const o = opts(a, a[3] && a[3].k === 'mat' ? 4 : 3, ['offset', 'mismatch', 'gain', 'noise', 'seed'], 'adcarch');
  const codes = wrap(() => M.archAdc([...x.d], arch, bits, range[0], range[1], { offset: o.n('offset'), mismatch: o.n('mismatch'), gain: o.n('gain'), noise: o.n('noise'), seed: o.n('seed') }));
  const step = (range[1] - range[0]) / 2 ** bits;
  return [mat(x.r, x.c, codes), mat(x.r, x.c, codes.map((c) => range[0] + (c + 0.5) * step))].slice(0, Math.max(1, nout));
});
def('dacarch', (a, nout, lab) => {
  if (a.length < 3) throw new LabError("dacarch('Segmented', bits, mismatch, 'MSB', 5, 'Seed', 1): 'Binary', 'Thermometer' or 'Segmented'.");
  const arch = textOf(a[0]).toLowerCase() as M.DacArch, bits = Math.round(toMat(a[1]).d[0]), mm = toMat(a[2]).d[0];
  if (!['binary', 'thermometer', 'segmented'].includes(arch)) throw new LabError("dacarch: the architecture is 'Binary', 'Thermometer' or 'Segmented'.");
  if (!(bits >= 2 && bits <= 16)) throw new LabError('dacarch: 2 to 16 bits.');
  if (!(mm >= 0 && mm < 0.5)) throw new LabError('dacarch: the unit sources’ mismatch is a share from 0 to 0.5 (0.01 is 1%).');
  const o = opts(a, 3, ['msb', 'seed'], 'dacarch');
  const r = wrap(() => M.archDac(arch, bits, mm, { msb: o.n('msb'), seed: o.n('seed') }));
  if (nout > 0) return [row(r.out), row(r.inl), row(r.dnl)];
  const k = row(r.out.map((_, i) => i)), w = (v: number[]) => Math.max(...v.map(Math.abs)).toFixed(2);
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'plot', k, row(r.dnl)); call(lab, 'ylabel', str('DNL (LSB)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`${arch[0].toUpperCase() + arch.slice(1)} DAC, ${bits} bits: worst DNL ${w(r.dnl)} LSB, worst INL ${w(r.inl)} LSB`));
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'plot', k, row(r.inl)); call(lab, 'ylabel', str('INL (LSB)')); call(lab, 'xlabel', str('Code')); call(lab, 'grid', str('on'));
  return [];
});

// ——— SerDes ———
def('prbs', (a) => {
  const order = Math.round(toMat(a[0] ?? num(7)).d[0]), n = Math.round(toMat(a[1] ?? num(2 ** Math.min(order, 16) - 1)).d[0]);
  if (!(n >= 1 && n <= 10_000_000)) throw new LabError('prbs(order, n): up to 10,000,000 bits.');
  return [col(wrap(() => M.prbs(order, n, a[2] ? toMat(a[2]).d[0] : 1)))];
});
const SERDES = ['rate', 'loss', 'skin', 'pam4', 'ffe', 'ctle', 'ctlefrequency', 'dfe', 'noise', 'jitter', 'bits', 'order', 'seed', 'samplesperui', 'channel'];
const linkOf = (a: Value[], from: number, what: string, lab: Lab) => {
  const o = opts(a, from, SERDES, what);
  const ch = o.raw('channel'), channel = ch ? (ch.k === 'struct' ? spOf(ch, what) : spFile(lab, textOf(ch))) : undefined;
  const rate = o.n('rate') ?? 10e9, bits = Math.round(o.n('bits') ?? 2000), sps = Math.round(o.n('samplesperui') ?? 32);
  if (!(rate > 0)) throw new LabError(`${what}: 'Rate' is the bit rate (bits a second).`);
  if (!(bits >= 200 && bits <= 100_000)) throw new LabError(`${what}: 200 to 100,000 bits.`);
  if (!(sps >= 8 && sps <= 128)) throw new LabError(`${what}: 8 to 128 samples a symbol.`);
  const dfe = Math.round(o.n('dfe') ?? 0); if (!(dfe >= 0 && dfe <= 8)) throw new LabError(`${what}: 0 to 8 DFE taps.`);
  return { rate, channel, loss: o.n('loss') ?? (channel ? 0 : 10), skin: o.n('skin'), pam4: o.b('pam4') ?? false, ffe: o.v('ffe'), ctle: o.n('ctle'), ctleAt: o.n('ctlefrequency'), dfe, noise: o.n('noise') ?? 0.01, jitter: o.n('jitter') ?? 0.01, bits, order: o.n('order'), seed: o.n('seed'), sps };
};
def('serdes', (a, nout, lab) => {
  const s = linkOf(a, 0, 'serdes', lab), r = wrap(() => M.linkRun(s)), sps = r.pulse.sps;
  if (nout > 0) return [struct([['EyeHeight', num(r.eyeHeight)], ['EyeWidth', num(r.eyeWidth)], ['WidthAtBER', num(r.widthAt)], ['BestPhase', num(r.bestPhase / sps)], ['Main', num(r.pulse.main)], ['Pre', row(r.pulse.pre)], ['Post', row(r.pulse.post)], ['DFETaps', row(r.dfeTaps)], ['Pulse', col(r.pulse.p.slice(0, Math.min(r.pulse.p.length, r.pulse.peak + 16 * sps)))], ['Wave', col(r.wave)], ['Symbols', col(r.symbols)], ['BER', col(r.bathtub.ber)], ['CDRPhase', col(r.cdr.map((p) => p / sps))]])];
  const ui = 1 / (s.pam4 ? s.rate / 2 : s.rate);
  // the pulse response, in symbols
  const P = r.pulse.p.slice(0, Math.min(r.pulse.p.length, r.pulse.peak + 12 * sps));
  call(lab, 'subplot', num(2), num(2), num(1)); call(lab, 'plot', row(P.map((_, i) => (i - r.pulse.peak) / sps)), row(P)); call(lab, 'grid', str('on')); call(lab, 'xlabel', str('Symbols from the main cursor')); call(lab, 'title', str(`Pulse response (main ${r.pulse.main.toFixed(3)})`));
  call(lab, 'subplot', num(2), num(2), num(2)); eye(lab, r.wave, sps, 300);
  call(lab, 'title', str(r.eyeHeight > 0 ? `Eye ${r.eyeHeight.toFixed(3)} high, ${(r.eyeWidth * 100).toFixed(0)}% wide` : 'The eye is closed'));
  call(lab, 'subplot', num(2), num(2), num(3)); call(lab, 'semilogy', row(r.bathtub.phase), row(r.bathtub.ber)); call(lab, 'yline', num(1e-12), str('--')); call(lab, 'ylim', row([1e-18, 1])); call(lab, 'grid', str('on')); call(lab, 'xlabel', str('Sampling phase (UI)'));
  call(lab, 'title', str(`Bathtub: ${(r.widthAt * 100).toFixed(0)}% open at 1e-12`));
  call(lab, 'subplot', num(2), num(2), num(4)); call(lab, 'plot', row(r.cdr.map((_, i) => i * ui * 1e9)), row(r.cdr.map((p) => p / sps))); call(lab, 'grid', str('on')); call(lab, 'xlabel', str('Time (ns)')); call(lab, 'ylabel', str('Phase (UI)')); call(lab, 'title', str('Bang-bang CDR'));
  return [];
});
/** Draws an eye: `traces` two-symbol windows of the waveform overlaid. */
function eye(lab: Lab, w: number[], sps: number, traces: number) {
  const n = 2 * sps + 1, start = 16, k = Math.min(traces, Math.floor((w.length / sps - start - 3)));
  if (k < 1) throw new LabError('eyediagram: the waveform is too short for one eye.');
  const Y = new Array(n * k);
  for (let j = 0; j < k; j++) for (let i = 0; i < n; i++) Y[i + j * n] = w[(start + j) * sps + i];
  call(lab, 'plot', col(Array.from({ length: n }, (_, i) => i / sps)), mat(n, k, Y), str('b'));
  call(lab, 'xlabel', str('Time (UI)')); call(lab, 'grid', str('on'));
}
def('eyediagram', (a, _nout, lab) => {
  const w = [...toMat(a[0] ?? num(NaN), 'The waveform').d], sps = Math.round(toMat(a[1] ?? num(NaN)).d[0]);
  if (!(sps >= 2)) throw new LabError('eyediagram(x, n): n samples a symbol (at least 2).');
  eye(lab, w, sps, a[2] ? Math.round(toMat(a[2]).d[0]) : 300);
  return [];
});

// ——— Verification exports ———
const SV: Record<string, string> = { double: 'real', float: 'shortreal', int8_t: 'byte', uint8_t: 'byte unsigned', int16_t: 'shortint', uint16_t: 'shortint unsigned', int32_t: 'int', uint32_t: 'int unsigned', int64_t: 'longint', uint64_t: 'longint unsigned', bool: 'bit' };
interface Arg { out: boolean; ty: string; name: string; n: number }
/** The arguments of a generated C prototype `void f(const double x[8], double k, double y[8], double *t);`. */
function parseProto(h: string, name: string): { args: Arg[]; ret: string } {
  const m = h.match(new RegExp(`(\\w+)\\s+${name}\\s*\\(([^)]*)\\);`));
  if (!m) throw new LabError(`dpigen: no prototype for ${name} in the generated header.`);
  const args = m[2].trim() === 'void' || !m[2].trim() ? [] : m[2].split(',').map((p) => {
    const q = p.trim().match(/^(const\s+)?(\w+)\s+(\*?)(\w+)(?:\[(\d+)\])?$/);
    if (!q) throw new LabError(`dpigen: can't read the argument “${p.trim()}”.`);
    return { out: !q[1] && (!!q[3] || !!q[5]), ty: q[2], name: q[4], n: q[5] ? +q[5] : 1 };
  });
  return { args, ret: m[1] };
}
const svLit = (ty: string, x: number) => (ty === 'double' || ty === 'float' ? (Number.isInteger(x) ? x.toFixed(1) : x.toPrecision(17)) : String(Math.trunc(x)));
def('dpigen', (a, nout, lab) => {
  const name = a[0] ? textOf(a[0]).replace(/\.m$/, '') : '';
  if (!/^[A-Za-z]\w*$/.test(name)) throw new LabError("dpigen('name', {example inputs}): a function of the script to verify in a SystemVerilog simulator.");
  const ex = a[1], exs = !ex ? [] : ex.k === 'cell' ? ex.d : [ex];
  const tys: Ty[] = exs.map((v, i) => {
    if (v.k !== 'mat' || v.im || (v.p ?? 1) > 1) throw new LabError(`dpigen: input ${i + 1} is a real number or matrix.`);
    return { cls: (v.logical ? 'logical' : v.cls ?? 'double') as Cls, r: v.r, c: v.c };
  });
  let out: { c: string; h: string };
  try { out = generate(lab.fns, name, tys); } catch (e) { if (e instanceof CodegenError) throw new LabError(`dpigen: ${e.message}`); throw e; }
  const { args, ret } = parseProto(out.h, name);
  if (ret !== 'void') args.push({ out: true, ty: ret, name: 'result', n: 1 });
  const svT = (t: string) => { const s = SV[t]; if (!s) throw new LabError(`dpigen: the C type ${t} has no SystemVerilog match.`); return s; };
  const dim = (x: Arg) => (x.n > 1 ? ` [${x.n}]` : '');
  const formal = args.filter((x) => x.name !== 'result').map((x) => `${x.out ? 'output' : 'input'} ${svT(x.ty)} ${x.name}${dim(x)}`).join(', ');
  const imp = `  import "DPI-C" function ${ret === 'void' ? 'void' : svT(ret)} ${name}(${formal});`;
  const callExpr = `${ret === 'void' ? '' : 'result = '}${name}(${args.filter((x) => x.name !== 'result').map((x) => x.name).join(', ')});`;
  const sv = `// ${name}_dpi.sv: Hyperion's ${name} as a SystemVerilog block through DPI-C (made by dpigen).
// Compile ${name}.c with the simulator (e.g. xrun ${name}.c ${name}_dpi.sv ${name}_tb.sv, or vcs -sverilog …).
module ${name}_dpi (
  input  logic clk${args.map((x) => `,\n  ${x.out ? 'output' : 'input '} ${svT(x.ty)} ${x.name}${dim(x)}`).join('')}
);
${imp}
  always @(posedge clk) ${callExpr}
endmodule
`;
  // the expected answers: Hyperion runs the function on the examples
  const res = lab.call(name, exs, args.filter((x) => x.out).length);
  const outs = args.filter((x) => x.out);
  const decl = args.map((x) => `  ${svT(x.ty)} ${x.name}${dim(x)};`).join('\n');
  let k = 0;
  const set = args.filter((x) => !x.out).map((x) => { const v = toMat(exs[k++]).d; return x.n > 1 ? Array.from({ length: x.n }, (_, i) => `    ${x.name}[${i}] = ${svLit(x.ty, v[i])};`).join('\n') : `    ${x.name} = ${svLit(x.ty, v[0])};`; }).join('\n');
  const tol = (t: string) => (t === 'double' ? '1e-9' : t === 'float' ? '1e-4' : '0');
  const checks = outs.map((x, j) => {
    const want = res[j] ? toMat(res[j]).d : [];
    const one = (lhs: string, w: number) => `    if (${tol(x.ty) === '0' ? `${lhs} !== ${svLit(x.ty, w)}` : `(${lhs} - ${svLit(x.ty, w)} > ${tol(x.ty)}) || (${svLit(x.ty, w)} - ${lhs} > ${tol(x.ty)})`}) begin errors++; $display("MISMATCH ${lhs}: got %0g, want ${w}", ${lhs}); end`;
    return x.n > 1 ? Array.from({ length: x.n }, (_, i) => one(`${x.name}[${i}]`, want[i] ?? NaN)).join('\n') : one(x.name, want[0] ?? NaN);
  }).join('\n');
  const tb = `// ${name}_tb.sv: a self-checking testbench for ${name}_dpi (made by dpigen): Hyperion's own answers for the example
// inputs are the scoreboard; the simulator passes when the C block gives the same.
module ${name}_tb;
  logic clk = 0;
${decl}
  int errors = 0;
  ${name}_dpi dut (.clk(clk)${args.map((x) => `, .${x.name}(${x.name})`).join('')});
  initial begin
${set}
    #1 clk = 1; #1 clk = 0;
${checks}
    if (errors == 0) $display("PASS: ${name} matches Hyperion"); else $display("FAIL: %0d mismatches", errors);
    $finish;
  end
endmodule
`;
  const fs = files(lab);
  if (fs) { fs.putText(`${name}.c`, out.c); fs.putText(`${name}.h`, out.h); fs.putText(`${name}_dpi.sv`, sv); fs.putText(`${name}_tb.sv`, tb); }
  if (nout > 0) return [struct([['C', str(out.c)], ['H', str(out.h)], ['SV', str(sv)], ['Testbench', str(tb)]])];
  lab.host.out(`Wrote ${name}.c, ${name}.h, ${name}_dpi.sv and ${name}_tb.sv${fs ? ' to Hyperion’s files' : ''}:\n\n${sv}\n`);
  return [];
});

// ——— IBIS buffers (M570) ———
const BUFFER_OPTS = ['vdd', 'wn', 'wp', 'l', 'kpn', 'kpp', 'vt', 'lambda', 'ccomp', 'rise', 'rload'];
/** The buffer from 'Vdd', 'Wn', 'Wp', 'L', 'KPn', 'KPp', 'Vt', 'Lambda', 'Ccomp', 'Rise' and 'Rload' (BUFFER0's otherwise). */
function bufferOf(o: ReturnType<typeof opts>): BufferSpec {
  const b = BUFFER0, l = o.n('l') ?? b.n.l, vt = o.n('vt') ?? b.n.vto, lam = o.n('lambda') ?? b.n.lambda;
  const s: BufferSpec = { ...b, vdd: o.n('vdd') ?? b.vdd, ccomp: o.n('ccomp') ?? b.ccomp, tin: o.n('rise') ?? b.tin, rload: o.n('rload') ?? b.rload,
    n: { ...b.n, w: o.n('wn') ?? b.n.w, l, kp: o.n('kpn') ?? b.n.kp, vto: vt, lambda: lam }, p: { ...b.p, w: o.n('wp') ?? b.p.w, l, kp: o.n('kpp') ?? b.p.kp, vto: vt, lambda: lam } };
  const pos = [s.vdd, s.ccomp, s.tin, s.rload, s.n.w, s.n.l, s.n.kp, s.p.w, s.p.kp];
  if (!pos.every((x) => Number.isFinite(x) && x > 0)) throw new LabError('The buffer’s supply, sizes, KP, capacitance, input rise and load must be positive.');
  if (!(s.n.vto > 0 && s.n.vto < s.vdd) || !(lam >= 0 && lam < 1)) throw new LabError('The buffer’s threshold is between 0 and the supply, its lambda 0 to 1.');
  if (s.vdd > 5 || s.tin > 1e-8 || s.ccomp > 1e-10) throw new LabError('The buffer: a supply up to 5 V, an input rise up to 10 ns, a pad capacitance up to 100 pF.');
  return s;
}
def('ibisbuffer', (a, nout, lab) => {
  const name = a[0] ? textOf(a[0]) : '';
  if (!/^[A-Za-z]\w*$/.test(name)) throw new LabError("ibisbuffer('name', 'Vdd', 1.8, 'Wn', 40e-6, 'Wp', 80e-6, 'L', 0.18e-6, 'KPn', 200e-6, 'KPp', 80e-6, 'Vt', 0.45, 'Ccomp', 1.5e-12, 'Rise', 100e-12): an IBIS model of a CMOS output buffer.");
  const o = opts(a, 1, [...BUFFER_OPTS, 'ami'], 'ibisbuffer'), s = bufferOf(o);
  const ibs = ibisFile(name, s, { ami: o.t('ami') });
  const fs = files(lab);
  if (fs) fs.putText(`${name.toLowerCase()}.ibs`, ibs);
  const iv = ivTables(s, 'typ'), rp = ramp(s, 'typ');
  if (nout > 0) {
    const t2 = (r: readonly (readonly [number, number])[]) => mat(r.length, 2, [...r.map((x) => x[0]), ...r.map((x) => x[1])]);
    return [struct([['IBIS', str(ibs)], ['Pulldown', t2(iv.pulldown)], ['Pullup', t2(iv.pullup)], ['GNDClamp', t2(iv.gndClamp)], ['POWERClamp', t2(iv.powerClamp)], ['RiseTime', num(rp.rise.dt)], ['FallTime', num(rp.fall.dt)], ['RiseSlope', num(rp.rise.dv / rp.rise.dt)], ['FallSlope', num(rp.fall.dv / rp.fall.dt)]])];
  }
  const C = ['typ', 'min', 'max'] as const;
  call(lab, 'subplot', num(1), num(2), num(1)); call(lab, 'hold', str('on'));
  for (const c of C) { const t = ivTables(s, c); call(lab, 'plot', row(t.pulldown.map((r) => r[0])), row(t.pulldown.map((r) => r[1] * 1e3))); }
  for (const c of C) { const t = ivTables(s, c); call(lab, 'plot', row(t.pullup.map((r) => s.vdd - r[0])), row(t.pullup.map((r) => r[1] * 1e3)), str('--')); }
  call(lab, 'hold', str('off')); call(lab, 'xlabel', str('Pin voltage (V)')); call(lab, 'ylabel', str('Current into the pin (mA)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str('Pulldown (solid) and pullup (dashed): typical, slow, fast'));
  call(lab, 'subplot', num(1), num(2), num(2)); call(lab, 'hold', str('on'));
  for (const c of C) for (const rising of [true, false]) { const w = transient(s, c, rising, rising ? 0 : corner(s, c).vdd, { n: 600 }); call(lab, 'plot', row(w.t.map((t) => t * 1e9)), row(w.v)); }
  call(lab, 'hold', str('off')); call(lab, 'xlabel', str('Time (ns)')); call(lab, 'ylabel', str('Pin (V) into 50 Ω'));
  call(lab, 'title', str(`Rise ${(rp.rise.dt * 1e12).toFixed(0)} ps, fall ${(rp.fall.dt * 1e12).toFixed(0)} ps (20–80%, typical)`)); call(lab, 'grid', str('on'));
  lab.host.out(`Wrote ${name.toLowerCase()}.ibs${fs ? ' to Hyperion’s files' : ''} (IBIS 7.1, typical, slow and fast corners).\n`);
  return [];
});

def('amigen', (a, nout, lab) => {
  const name = a[0] ? textOf(a[0]) : '', side = a[1] ? textOf(a[1]).toLowerCase() : '';
  if (!/^[A-Za-z]\w*$/.test(name) || !['tx', 'rx'].includes(side)) throw new LabError("amigen('name', 'Tx', 'FFE', [-0.1 0.8 -0.1], 'Rate', 25e9) or amigen('name', 'Rx', 'CTLE', 8, 'DFE', 3, 'Rate', 25e9): an IBIS-AMI equaliser model.");
  const o = opts(a, 2, ['ffe', 'ctle', 'ctlefrequency', 'dfe', 'rate', ...BUFFER_OPTS], 'amigen');
  const rate = o.n('rate') ?? 10e9, ffe = o.v('ffe') ?? [0, 1, 0], ctle = o.n('ctle') ?? 0, dfe = Math.round(o.n('dfe') ?? 0), fp = o.n('ctlefrequency') ?? rate / 2;
  if (!(rate > 0) || !(ctle >= 0 && ctle <= 30) || !(dfe >= 0 && dfe <= 16) || ffe.length > 16) throw new LabError('amigen: a positive rate, CTLE peaking 0 to 30 dB, up to 16 DFE taps and 16 FFE taps.');
  const tx = side === 'tx';
  const ami = tx
    ? `(${name}
  (Description "Hyperion TX FFE, ${ffe.length} taps")
  (Reserved_Parameters
    (AMI_Version (Usage Info) (Type String) (Value "7.1"))
    (Init_Returns_Impulse (Usage Info) (Type Boolean) (Value True))
    (GetWave_Exists (Usage Info) (Type Boolean) (Value True))
    (Max_Init_Aggressors (Usage Info) (Type Integer) (Value 0)))
  (Model_Specific
${ffe.map((c, i) => `    (tap${i} (Usage In) (Type Float) (Format Range ${c} -1 1) (Default ${c}) (Description "FFE tap ${i}"))`).join('\n')}))
`
    : `(${name}
  (Description "Hyperion RX: CTLE ${ctle} dB at ${eng(fp)}Hz${dfe ? `, DFE ${dfe} taps` : ''}")
  (Reserved_Parameters
    (AMI_Version (Usage Info) (Type String) (Value "7.1"))
    (Init_Returns_Impulse (Usage Info) (Type Boolean) (Value True))
    (GetWave_Exists (Usage Info) (Type Boolean) (Value True))
    (Max_Init_Aggressors (Usage Info) (Type Integer) (Value 0)))
  (Model_Specific
    (ctle_peaking_db (Usage In) (Type Float) (Format Range ${ctle} 0 30) (Default ${ctle}))
    (ctle_peak_hz (Usage In) (Type Float) (Format Value ${fp}) (Default ${fp}))
    (dfe_taps (Usage In) (Type Integer) (Format Range ${dfe} 0 16) (Default ${dfe}))))
`;
  // M570: a complete IBIS model: the buffer's own I-V and V-t tables at three corners (ibis.ts), pointing at this .ami
  const ibs = ibisFile(name, bufferOf(o), { ami: `${name}.ami`, tx });
  const c = `/* ${name}_ami.c: an IBIS-AMI ${tx ? 'transmitter FFE' : 'receiver CTLE and DFE'} (made by Hyperion's amigen).
   Build: gcc -shared -fPIC -O2 -o ${name}_linux64.so ${name}_ami.c -lm (Windows: cl /LD). Parameters arrive as the
   .ami file's tree; this model reads its own defaults (${tx ? 'the taps' : 'the CTLE and DFE'}) and keeps them simple. */
#include <math.h>
#include <stdlib.h>
#include <string.h>
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif
#ifdef _WIN32
#define AMI_EXPORT __declspec(dllexport)
#else
#define AMI_EXPORT
#endif
typedef struct { double dt, ui; long spb; ${tx ? `double taps[${Math.max(1, ffe.length)}]; int ntaps, main;` : 'double a1, a2, b0, b1, b2, x1, x2, y1, y2; int ndfe; double dfe[16]; double last[16];'} } State;
${tx ? `static const double TAPS[] = { ${ffe.join(', ')} };` : `static const double PEAK_DB = ${ctle}, PEAK_HZ = ${fp};`}
${tx ? `/* y[n] = Σ c_k x[n − (k − main)·spb]: the FFE on a waveform sampled every dt */
static void ffe(State *s, double *w, long n) {
  double *y = calloc((size_t)n, sizeof *y);
  for (long i = 0; i < n; i++) for (int k = 0; k < s->ntaps; k++) { long j = i - (long)(k - s->main) * s->spb; if (j >= 0 && j < n) y[i] += s->taps[k] * w[j]; }
  memcpy(w, y, (size_t)n * sizeof *w); free(y);
}` : `/* the CTLE as a biquad by the bilinear transform: H(s) = (1 + s/wz) / ((1 + s/wp)(1 + s/(4 wp))) / peaking */
static void ctle_init(State *s) {
  double pk = pow(10, PEAK_DB / 20), wp = 2 * M_PI * PEAK_HZ, wz = wp / pk, wp2 = 4 * wp, K = 2 / s->dt;
  double n0 = 1 / pk, n1 = 1 / (pk * wz), d0 = 1, d1 = 1 / wp + 1 / wp2, d2 = 1 / (wp * wp2);
  double A0 = d2 * K * K + d1 * K + d0, A1 = 2 * d0 - 2 * d2 * K * K, A2 = d2 * K * K - d1 * K + d0;
  s->b0 = (n1 * K + n0) / A0; s->b1 = (2 * n0) / A0; s->b2 = (n0 - n1 * K) / A0; s->a1 = A1 / A0; s->a2 = A2 / A0;
  s->x1 = s->x2 = s->y1 = s->y2 = 0;
}
static void ctle(State *s, double *w, long n) {
  for (long i = 0; i < n; i++) {
    double x = w[i], y = s->b0 * x + s->b1 * s->x1 + s->b2 * s->x2 - s->a1 * s->y1 - s->a2 * s->y2;
    s->x2 = s->x1; s->x1 = x; s->y2 = s->y1; s->y1 = y; w[i] = y;
  }
}`}
AMI_EXPORT long AMI_Init(double *impulse_matrix, long row_size, long aggressors, double sample_interval, double bit_time,
                         char *AMI_parameters_in, char **AMI_parameters_out, void **AMI_memory_handle, char **msg) {
  State *s = calloc(1, sizeof *s);
  (void)aggressors; (void)AMI_parameters_in;
  s->dt = sample_interval; s->ui = bit_time; s->spb = (long)(bit_time / sample_interval + 0.5);
${tx ? `  s->ntaps = ${ffe.length}; s->main = 0;
  for (int k = 0; k < s->ntaps; k++) { s->taps[k] = TAPS[k]; if (fabs(TAPS[k]) > fabs(TAPS[s->main])) s->main = k; }
  ffe(s, impulse_matrix, row_size);` : `  ctle_init(s); ctle(s, impulse_matrix, row_size); ctle_init(s);
  /* DFE taps by zero forcing: the equalised pulse's post-cursors at the peak's phase, one symbol apart */
  s->ndfe = ${dfe};
  if (s->ndfe) {
    double *p = calloc((size_t)row_size, sizeof *p); long pk = 0;
    for (long i = 0; i < row_size; i++) { for (long j = 0; j < s->spb && i - j >= 0; j++) p[i] += impulse_matrix[i - j] * s->dt; if (p[i] > p[pk]) pk = i; }
    for (int k = 0; k < s->ndfe; k++) { long i = pk + (long)(k + 1) * s->spb; s->dfe[k] = i < row_size ? p[i] : 0; }
    free(p);
  }`}
  *AMI_memory_handle = s;
  static char out[256], note[] = "Hyperion ${tx ? 'TX FFE' : 'RX CTLE/DFE'} ready";
  strcpy(out, "(${name})"); *AMI_parameters_out = out; *msg = note;
  return 1;
}
AMI_EXPORT long AMI_GetWave(double *wave, long wave_size, double *clock_times, char **AMI_parameters_out, void *AMI_memory_handle) {
  State *s = AMI_memory_handle;
${tx ? `  (void)clock_times; ffe(s, wave, wave_size);` : `  ctle(s, wave, wave_size);
  /* DFE: at each symbol, subtract the taps times the earlier decisions (a slicer at 0) for the symbol's samples */
  if (s->ndfe) for (long i = 0; i < wave_size; i++) {
    if (i % s->spb == 0) { for (int k = s->ndfe - 1; k > 0; k--) s->last[k] = s->last[k - 1]; s->last[0] = i ? (wave[i - 1] >= 0 ? 1 : -1) : 0; }
    double fb = 0; for (int k = 0; k < s->ndfe; k++) fb += s->dfe[k] * s->last[k];
    wave[i] -= fb;
  }
  if (clock_times) clock_times[0] = -1;`}
  static char out[64]; strcpy(out, "(${name})"); *AMI_parameters_out = out;
  return 1;
}
AMI_EXPORT long AMI_Close(void *AMI_memory_handle) { free(AMI_memory_handle); return 1; }
`;
  const fs = files(lab);
  if (fs) { fs.putText(`${name}.ami`, ami); fs.putText(`${name.toLowerCase()}.ibs`, ibs); fs.putText(`${name}_ami.c`, c); }
  if (nout > 0) return [struct([['AMI', str(ami)], ['IBIS', str(ibs)], ['C', str(c)]])];
  lab.host.out(`Wrote ${name}.ami, ${name.toLowerCase()}.ibs and ${name}_ami.c${fs ? ' to Hyperion’s files' : ''}:\n\n${ami}\n`);
  return [];
});

// ——— Running real simulators (M569): cosim through Hyperion's computer app, rawread for their results ———
const SIM_IDS: Record<string, 'sv' | 'spice'> = { verilator: 'sv', xrun: 'sv', vcs: 'sv', qrun: 'sv', ngspice: 'spice', xyce: 'spice', spectre: 'spice', hspice: 'spice' };
const SIM_EXT = /\.(sv|svh|v|vh|c|h|cir|sp|spi|scs|net|va|inc|lib)$/i;
const dec = new TextDecoder();
/** The files to send: those named, or for a testbench every file of its block (name.c, name.h, name_dpi.sv, name_tb.sv),
 *  for a netlist the netlist and the model files beside it (.va, .inc, .lib). */
function simFiles(lab: Lab, kind: 'sv' | 'spice', top: string, named?: string[]) {
  const fs = files(lab);
  if (!fs) throw new LabError('cosim: Hyperion’s files aren’t here.');
  const all = [...fs.files.keys()];
  const pick = named ?? (kind === 'sv'
    ? all.filter((n) => SIM_EXT.test(n) && (n.startsWith(`${top.replace(/_tb$/, '')}.`) || n.startsWith(`${top.replace(/_tb$/, '')}_`)))
    : all.filter((n) => n === top || /\.(va|inc|lib)$/i.test(n)));
  if (!pick.length) throw new LabError(`cosim: no files for ${top} in Hyperion’s files (make them with dpigen or spicegen, or name them with 'Files').`);
  const out: Record<string, string> = {};
  for (const n of pick) { if (!SIM_EXT.test(n)) throw new LabError(`cosim: “${n}” isn’t a SystemVerilog, C or netlist file.`); out[n] = dec.decode(fs.get(n).bytes); }
  return out;
}
interface SimAnswer { ok: boolean; exitCode?: number; error?: string; missing?: boolean; cancelled?: boolean; ms?: number; raw?: string | null; out?: string }
def('cosim', (a, nout, lab) => {
  if (!waits.page) throw new LabError('cosim needs the Code window open in Hyperion’s computer app, which runs the simulators installed on your computer.');
  if (!a.length) {
    const t = askPage<Record<string, { name: string; kind: string }>>('cosimtools', {}, 15_000) ?? {};
    const ids = Object.keys(t);
    if (nout > 0) return [struct(ids.map((id) => [id, str(t[id].name)]))];
    lab.host.out(ids.length ? `Simulators on this computer:\n${ids.map((id) => `  ${id.padEnd(10)} ${t[id].name} (${t[id].kind === 'sv' ? 'SystemVerilog' : 'circuits'})`).join('\n')}\n` : 'No simulators found on this computer’s PATH (Verilator, ngspice and Xyce are free; Xcelium, VCS, Questa, Spectre and HSPICE are licensed).\n');
    return [];
  }
  const id0 = textOf(a[0]), id = id0.toLowerCase(), kind = SIM_IDS[id];
  if (!kind) throw new LabError(`cosim: the simulator is one of ${Object.keys(SIM_IDS).join(', ')}.`);
  const top = a[1] ? textOf(a[1]) : '';
  if (!top) throw new LabError(kind === 'sv' ? "cosim('verilator', 'name_tb'): the testbench's top module." : "cosim('ngspice', 'deck.cir'): the netlist in Hyperion's files.");
  const o = opts(a, 2, ['files', 'timeout'], 'cosim');
  const named = o.has('files') ? (() => { const v = o.raw('files')!; return v.k === 'cell' ? v.d.map((x) => textOf(x)) : [textOf(v)]; })() : undefined;
  const secs = o.n('timeout') ?? 600;
  if (!(secs >= 5 && secs <= 1200)) throw new LabError("cosim: 'Timeout' is 5 to 1200 seconds.");
  const r = askPage<SimAnswer>('cosim', { id: id === 'xyce' ? 'Xyce' : id, files: simFiles(lab, kind, top, named), top }, secs * 1000);
  if (!r) throw new LabError(`cosim: no answer within ${secs} seconds (the simulator may still be running: try a longer 'Timeout').`);
  if (r.missing || r.cancelled) throw new LabError(r.error ?? 'Not run.');
  const out = r.out ?? '', passed = r.ok && (kind === 'spice' || (!/\b(FAIL|MISMATCH)\b/.test(out) && /\bPASS\b/.test(out)));
  const fields: [string, Value][] = [['Passed', yes(passed)], ['Output', str(out)], ['ExitCode', num(r.exitCode ?? (r.ok ? 0 : NaN))], ['Seconds', num((r.ms ?? 0) / 1000)]];
  if (r.raw) fields.push(['Results', rawStruct(Uint8Array.from(atob(r.raw), (c) => c.charCodeAt(0)))]);
  if (nout > 0) return [struct(fields)];
  lab.host.out(`${out}${out.endsWith('\n') ? '' : '\n'}${passed ? '✓' : '✗'} ${id0}${r.error ? `: ${r.error}` : ''} (${((r.ms ?? 0) / 1000).toFixed(1)} s)\n`);
  return [];
});
const fieldName = (v: string, used: Set<string>) => { let n = v.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'v'; if (!/^[A-Za-z]/.test(n)) n = `v_${n}`; let k = n, i = 2; while (used.has(k)) k = `${n}_${i++}`; used.add(k); return k; };
function rawStruct(bytes: Uint8Array, which = 0): Struct {
  const plots = wrap(() => rawPlots(bytes)), p = plots[Math.min(plots.length - 1, Math.max(0, which))], used = new Set<string>();
  const f: [string, Value][] = [['Plot', str(p.name)]];
  p.vars.forEach((v, i) => { const m = mat(p.data[i].re.length, 1, p.data[i].re); if (p.complex && p.data[i].im!.some((x) => x !== 0)) m.im = Float64Array.from(p.data[i].im!); f.push([fieldName(v, used), m]); });
  return struct(f);
}
def('rawread', (a, _nout, lab) => {
  const name = a[0] ? textOf(a[0]) : '';
  if (!name) throw new LabError("rawread('out.raw', k): a SPICE raw file in Hyperion's files (ngspice, Xyce, Spectre), its k-th plot (1 by default).");
  const fs = files(lab);
  if (!fs) throw new LabError('rawread: Hyperion’s files aren’t here.');
  return [rawStruct(fs.get(name).bytes, a[1] ? Math.round(toMat(a[1]).d[0]) - 1 : 0)];
});

// ——— S-parameters (M571): Touchstone files, mixed-mode, a measured channel for serdes ———
/** S-parameters as Hyperion shows them: Parameters n × n × frequencies (complex), Frequencies, NumPorts, Impedance. */
function spStruct(sp: TS.SParams): Struct {
  const n = sp.n, F = sp.f.length, re = new Float64Array(n * n * F), im = new Float64Array(n * n * F);
  for (let k = 0; k < F; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const o = TS.at(sp, i, j, k), q = i + j * n + k * n * n; re[q] = sp.re[o]; im[q] = sp.im[o]; }
  const P: Mat = { k: 'mat', r: n, c: n, ...(F > 1 ? { p: F } : {}), d: re, im };
  return struct([['Parameters', P], ['Frequencies', col(sp.f)], ['NumPorts', num(n)], ['Impedance', num(sp.z0)]]);
}
function spOf(v: Value, what: string): TS.SParams {
  if (v.k !== 'struct' || !v.f.has('Parameters') || !v.f.has('Frequencies')) throw new LabError(`${what}: S-parameters from sparameters.`);
  const P = toMat(v.f.get('Parameters')!), f = [...toMat(v.f.get('Frequencies')!).d], n = P.r, F = f.length;
  if (P.c !== n || P.d.length !== n * n * F) throw new LabError(`${what}: the parameters are n × n × (one page a frequency).`);
  const re = new Float64Array(n * n * F), im = new Float64Array(n * n * F);
  for (let k = 0; k < F; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const q = i + j * n + k * n * n, o = TS.at({ n } as TS.SParams, i, j, k); re[o] = P.d[q]; im[o] = P.im ? P.im[q] : 0; }
  return { f, n, re, im, z0: v.f.has('Impedance') ? toMat(v.f.get('Impedance')!).d[0] : 50 };
}
function spFile(lab: Lab, name: string): TS.SParams {
  const fs = files(lab);
  if (!fs) throw new LabError('sparameters: Hyperion’s files aren’t here.');
  const m = /\.s(\d+)p$/i.exec(name);
  return wrap(() => TS.readTouchstone(dec.decode(fs.get(name).bytes), m ? +m[1] : undefined));
}
def('sparameters', (a, _nout, lab) => {
  const what = a[0] ? textOf(a[0]) : '';
  if (!what) throw new LabError("sparameters('channel.s4p') reads a Touchstone file from Hyperion's files; sparameters('model', 'Loss', 20, 'Rate', 25e9, 'Delay', 2e-9) makes a lossy line.");
  if (what.toLowerCase() === 'model') {
    const o = opts(a, 1, ['loss', 'rate', 'delay', 'fmax', 'points'], 'sparameters');
    const rate = o.n('rate') ?? 25e9, loss = o.n('loss') ?? 20, pts = Math.round(o.n('points') ?? 2000);
    if (!(rate > 0 && loss >= 0 && loss <= 80 && pts >= 10 && pts <= 20000)) throw new LabError('sparameters model: a positive rate, loss 0 to 80 dB, 10 to 20,000 points.');
    return [spStruct(TS.lossyLine(loss, rate / 2, o.n('fmax') ?? 2 * rate, o.n('delay') ?? 2e-9, pts))];
  }
  return [spStruct(spFile(lab, what))];
});
def('rfwrite', (a, _nout, lab) => {
  const sp = spOf(a[0] ?? num(NaN), 'rfwrite'), name = a[1] ? textOf(a[1]) : '';
  if (!new RegExp(`^[\\w.-]+\\.s${sp.n}p$`, 'i').test(name)) throw new LabError(`rfwrite(s, 'name.s${sp.n}p'): a Touchstone file name ending in .s${sp.n}p.`);
  const fs = files(lab);
  if (!fs) throw new LabError('rfwrite: Hyperion’s files aren’t here.');
  fs.putText(name, TS.writeTouchstone(sp, 'Hyperion rfwrite'));
  return [];
});
def('s2sdd', (a) => {
  const sp = spOf(a[0] ?? num(NaN), 's2sdd');
  const pr = a[1] ? toMat(a[1]).d : [1, 3, 2, 4];
  if (pr.length !== 4 || new Set(pr).size !== 4 || ![...pr].every((x) => x >= 1 && x <= 4)) throw new LabError('s2sdd(s, [p1 n1 p2 n2]): the four ports as the two pairs (1 3 2 4 by default).');
  return [spStruct(wrap(() => TS.sdd(sp, [[pr[0] - 1, pr[1] - 1], [pr[2] - 1, pr[3] - 1]])))];
});
def('rfparam', (a) => {
  const sp = spOf(a[0] ?? num(NaN), 'rfparam'), i = Math.round(toMat(a[1] ?? num(NaN)).d[0]) - 1, j = Math.round(toMat(a[2] ?? num(NaN)).d[0]) - 1;
  if (!(i >= 0 && j >= 0 && i < sp.n && j < sp.n)) throw new LabError(`rfparam(s, i, j): ports 1 to ${sp.n}.`);
  const F = sp.f.length, m = mat(F, 1, Array.from({ length: F }, (_, k) => sp.re[TS.at(sp, i, j, k)]));
  m.im = Float64Array.from({ length: F }, (_, k) => sp.im[TS.at(sp, i, j, k)]);
  return [m];
});

// ——— Netlists for SPICE simulators (M572): Hyperion's designs for ngspice, Xyce, Spectre or HSPICE (cosim runs them) ———
const g6 = (x: number) => +x.toPrecision(6);
def('spicegen', (a, nout, lab) => {
  const name = a[0] ? textOf(a[0]) : '';
  if (!/^[\w.-]+\.(cir|sp|scs)$/i.test(name)) throw new LabError("spicegen('name.cir', p) writes a netlist: p from plldesign (its loop filter, an AC analysis), or 'buffer' with ibisbuffer's options (the output stage into 50 Ω, a transient).");
  const what = a[1];
  if (!what) throw new LabError('spicegen: the design (a plldesign result, or \'buffer\').');
  const o = opts(a, 2, [...BUFFER_OPTS, 'spectre', 'from', 'to'], 'spicegen');
  const head = o.b('spectre') ? 'simulator lang=spice\n' : '';
  let deck: string;
  if (what.k === 'struct') {
    const d = designOf(what, 'spicegen'), f1 = o.n('from') ?? d.bandwidth / 100, f2 = o.n('to') ?? Math.min(d.fref / 2, d.bandwidth * 100);
    if (!(f1 > 0 && f2 > f1)) throw new LabError("spicegen: 'From' and 'To' are frequencies with From < To.");
    deck = `* ${name}: Hyperion's PLL loop filter (plldesign: N = ${g6(d.n)}, ${g6(d.bandwidth)} Hz, ${g6(d.margin)} deg)
* 1 A AC from the charge pump into the filter: v(out) is its impedance Z (ohms); compare with Hyperion's pllBode.
${head}IPUMP 0 out DC 0 AC 1
C1 out 0 ${g6(d.c1)}
R2 out mid ${g6(d.r2)}
C2 mid 0 ${g6(d.c2)}
RDC out 0 1e15
.ac dec 50 ${g6(f1)} ${g6(f2)}
.end
`;
  } else if (textOf(what).toLowerCase() === 'buffer') {
    const s = bufferOf(o);
    deck = `* ${name}: Hyperion's output buffer (ibisbuffer): a level-1 CMOS stage, the input falling at 0.2 ns, the pad rising
* into ${s.rload} ohms and ${g6(s.ccomp)} F. Compare v(pad) with ibisbuffer's rising waveform.
${head}VDD vdd 0 ${g6(s.vdd)}
VG g 0 PWL(0 ${g6(s.vdd)} 0.2n ${g6(s.vdd)} ${g6(0.2e-9 + s.tin)} 0)
M1 pad g 0 0 nch W=${g6(s.n.w)} L=${g6(s.n.l)}
M2 pad g vdd vdd pch W=${g6(s.p.w)} L=${g6(s.p.l)}
RL pad 0 ${g6(s.rload)}
CC pad 0 ${g6(s.ccomp)}
.model nch nmos level=1 kp=${g6(s.n.kp)} vto=${g6(s.n.vto)} lambda=${g6(s.n.lambda)}
.model pch pmos level=1 kp=${g6(s.p.kp)} vto=${g6(-s.p.vto)} lambda=${g6(s.p.lambda)}
.tran 1p 2n
.end
`;
  } else throw new LabError("spicegen: the design is a plldesign result or 'buffer'.");
  const fs = files(lab);
  if (fs) fs.putText(name, deck);
  if (nout > 0) return [str(deck)];
  lab.host.out(`Wrote ${name}${fs ? ' to Hyperion’s files' : ''}: run it with cosim('ngspice', '${name}') (or 'xyce', 'spectre', 'hspice').\n\n${deck}`);
  return [];
});
