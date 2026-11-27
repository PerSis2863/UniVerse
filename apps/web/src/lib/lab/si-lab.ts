import { LabError } from './parse';
import { textOf, type Lab } from './interp';
import { cmat, imOf, mat, num, str, toMat, type Value } from './values';
import { fileText, writeFileText } from './files';
import * as si from './si';
import { call, col, def, field, isText, lines, need, nums, options, optNum, optText, record, row } from './sci-kit';

// Hyperion's signal and power integrity in the language (M576): sparamLine, sparameters, rfparam, touchstoneWrite,
// ctleResponse, pulseResponse, eyeDiagram, pdnImpedance, irDrop. MathWorks spreads these over the RF, Signal
// Integrity, SerDes and RF PCB toolboxes; our own code, rfparam and sparameters keep the familiar names.

/** S-parameters as a struct: Frequencies (column), Parameters (n × n × frequencies, complex), NumPorts, Impedance. */
function sStruct(f: number[], s: si.C[][][], zref: number) {
  const n = s[0]?.length ?? 0, re: number[] = [], im: number[] = [];
  for (const m of s) for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) { re.push(m[r][c][0]); im.push(m[r][c][1]); }
  return record([['Type', 'sparameters'], ['Frequencies', col(f)], ['Parameters', cmat(n, n, re, im)], ['NumPorts', n], ['Impedance', zref]]);
}
function sOf(v: Value | undefined, w: string) {
  if (v?.k !== 'struct' || !v.f.has('Parameters') || !v.f.has('Frequencies')) throw new LabError(`${w} needs S-parameters (from sparamLine or sparameters).`);
  const P = toMat(v.f.get('Parameters')!), f = [...toMat(v.f.get('Frequencies')!).d], n = P.r, im = imOf(P), zref = field(v, 'Impedance', w);
  const s: si.C[][][] = f.map((_, k) => Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => { const q = k * n * n + c * n + r; return [P.d[q], im[q]] as si.C; })));
  return { f, n, s, zref };
}
/** The through response: S21 of a 2-port, the differential SDD21 of a 4-port (ports 1, 2 in; 3, 4 out). */
const through = (S: ReturnType<typeof sOf>) => S.s.map((m) => (S.n === 4 ? si.sdd21(m) : S.n === 2 ? m[1][0] : (() => { throw new LabError('The channel is a 2-port or a 4-port.'); })()));
const ctleOf = (v: Value | undefined): [number, number, number, number] | null => {
  if (!v) return null;
  const c = nums(v, "'CTLE'");
  if (c.length !== 4 || !(c[1] > 0 && c[2] > 0 && c[3] > 0)) throw new LabError("'CTLE' is [DC gain dB, zero Hz, pole1 Hz, pole2 Hz] (or 'auto').");
  return c as [number, number, number, number];
};

def('sparamLine', (a) => {
  const f = nums(a[0], 'The frequencies (Hz)'), o = options(a, 1, ['Length', 'Z0', 'Dk', 'Df', 'Width', 'Zref', 'Stub'], 'sparamLine');
  const st = o.has('Stub') ? nums(o.get('Stub')) : null;
  const l: si.Line = { length: optNum(o, 'Length', 0.1), z0: optNum(o, 'Z0', 50), dk: optNum(o, 'Dk', 3.7), df: optNum(o, 'Df', 0.01), width: optNum(o, 'Width', 127e-6), zref: optNum(o, 'Zref', 50), ...(st ? { stub: { length: st[0], at: st[1] ?? 0.5, z0: st[2] ?? optNum(o, 'Z0', 50) } } : {}) };
  if (!(l.length > 0 && l.z0 > 0 && l.dk >= 1 && l.df >= 0 && l.width > 0 && l.zref > 0) || f.some((x) => !(x >= 0)) || (l.stub && !(l.stub.length > 0 && l.stub.at >= 0 && l.stub.at <= 1))) throw new LabError("sparamLine: 'Length', 'Width' (m), 'Z0', 'Zref' above 0, 'Dk' ≥ 1, 'Df' ≥ 0; 'Stub' [length share-along Z0].");
  const r = si.lineS(f, l);
  return [sStruct(f, f.map((_, k) => [[r.s11[k], r.s21[k]], [r.s21[k], r.s11[k]]]), l.zref)];
});
def('sparameters', (a, _n, lab) => {
  const src = textOf(a[0]), text = src.includes('\n') ? src : fileText(lab as Lab, src), ports = a[1] ? need(a[1], 'The ports') : undefined;
  try { const t = si.touchstone(text, ports); return [sStruct(t.f, t.s, t.zref)]; } catch (e) { throw new LabError((e as Error).message); }
});
def('rfparam', (a) => {
  const S = sOf(a[0], 'rfparam');
  if (isText(a[1])) { if (a[1].v.toLowerCase() !== 'sdd21' || S.n !== 4) throw new LabError("rfparam(S, 'sdd21') needs a 4-port."); const v = S.s.map(si.sdd21); return [cmat(v.length, 1, v.map((x) => x[0]), v.map((x) => x[1]))]; }
  const i = need(a[1], 'rfparam(S, i, j)'), j = need(a[2], 'rfparam(S, i, j)');
  if (!(i >= 1 && i <= S.n && j >= 1 && j <= S.n)) throw new LabError(`rfparam: i and j between 1 and ${S.n}.`);
  return [cmat(S.f.length, 1, S.s.map((m) => m[i - 1][j - 1][0]), S.s.map((m) => m[i - 1][j - 1][1]))];
});
def('touchstoneWrite', (a, _n, lab) => {
  const S = sOf(a[0], 'touchstoneWrite'), text = si.writeTouchstone(S.f, S.s, S.zref);
  if (a[1]) { writeFileText(lab as Lab, textOf(a[1]), text); return []; }
  return [str(text)];
});
def('ctleResponse', (a) => {
  const f = toMat(a[0], 'The frequencies'), c = ctleOf(a[1]);
  if (!c) throw new LabError('ctleResponse(f, [dc fz fp1 fp2]).');
  const v = [...f.d].map((x) => si.ctle(x, ...c));
  return [cmat(f.r, f.c, v.map((x) => x[0]), v.map((x) => x[1]))];
});
def('pulseResponse', (a, nout, lab) => {
  const S = sOf(a[0], 'pulseResponse'), rate = need(a[1], 'pulseResponse(S, symbol rate)'), o = options(a, 2, ['SamplesPerUI', 'Rise', 'CTLE'], 'pulseResponse');
  const spu = Math.round(optNum(o, 'SamplesPerUI', 16)), c = ctleOf(o.get('CTLE'));
  if (!(rate > 0 && spu >= 4 && spu <= 64)) throw new LabError("pulseResponse: a symbol rate above 0, 'SamplesPerUI' 4 to 64.");
  const p = si.pulseResponse(S.f, through(S), rate, spu, 512, optNum(o, 'Rise', 0), c ? (x) => si.ctle(x, ...c) : undefined);
  const lo = Math.max(0, p.cursor - 8 * spu), hi = Math.min(p.N, p.cursor + 40 * spu), t = Array.from({ length: hi - lo }, (_, k) => (lo + k - p.cursor) / spu), v = p.p.slice(lo, hi);
  if (nout > 0) return [row(v), row(t), num(p.cursor - lo + 1)];
  const cur = Array.from({ length: 48 }, (_, k) => k - 8).filter((k) => p.cursor + k * spu < p.N);
  lines(lab, t, [v], [], 'Time (UI from the main cursor)', 'Response (V for a 1 V symbol)', `Main cursor ${p.p[p.cursor].toFixed(3)} V, first post cursor ${p.p[p.cursor + spu].toFixed(3)} V`);
  call(lab, 'hold', str('on')); call(lab, 'plot', row(cur), row(cur.map((k) => p.p[p.cursor + k * spu])), str('o')); call(lab, 'hold', str('off'));
  return [];
});
def('eyeDiagram', (a, nout, lab) => {
  const S = sOf(a[0], 'eyeDiagram'), rate = need(a[1], 'eyeDiagram(S, symbol rate)');
  const w = 'eyeDiagram', o = options(a, 2, ['Modulation', 'PRBS', 'Symbols', 'Swing', 'FFE', 'FFETaps', 'FFEPre', 'CTLE', 'DFE', 'RJ', 'DJ', 'Noise', 'BER', 'Crosstalk', 'Mask', 'SamplesPerUI', 'Rise', 'Seed'], w);
  const mod = optText(o, 'Modulation', 'NRZ').toUpperCase(), spu = Math.round(optNum(o, 'SamplesPerUI', 16)), nsym = Math.round(optNum(o, 'Symbols', 2000));
  if ((mod !== 'NRZ' && mod !== 'PAM4') || !(rate > 0 && spu >= 4 && spu <= 64 && nsym >= 100 && nsym <= 20000)) throw new LabError(`${w}: 'Modulation' 'NRZ' or 'PAM4', 'SamplesPerUI' 4 to 64, 'Symbols' 100 to 20,000.`);
  const H = through(S), rise = optNum(o, 'Rise', 0), xt = o.has('Crosstalk') ? nums(o.get('Crosstalk')) : [0, 0], mk = o.has('Mask') ? nums(o.get('Mask')) : null;
  const base: si.Eye = { rate, spu, pam4: mod === 'PAM4', order: Math.round(optNum(o, 'PRBS', 7)), nsym, swing: optNum(o, 'Swing', 0.8), ffe: [], ffePre: 0, dfe: Math.round(optNum(o, 'DFE', 0)), rj: optNum(o, 'RJ', 0), dj: optNum(o, 'DJ', 0), noise: optNum(o, 'Noise', 0), ber: optNum(o, 'BER', 1e-12), xtalk: [xt[0] ?? 0, xt[1] ?? 0], ...(mk ? { mask: [mk[0], mk[1]] as [number, number] } : {}), seed: Math.round(optNum(o, 'Seed', 1)) };
  if (![7, 9, 11, 15, 23, 31].includes(base.order) || base.dfe < 0 || base.dfe > 20) throw new LabError(`${w}: 'PRBS' 7, 9, 11, 15, 23 or 31; 'DFE' 0 to 20 taps.`);
  const cv = o.get('CTLE'), auto = cv && isText(cv) && cv.v.toLowerCase() === 'auto';
  let ctle = auto ? null : ctleOf(cv);
  const nyq = rate / 2, pulse = (c: typeof ctle) => si.pulseResponse(S.f, H, rate, spu, 512, rise, c ? (x) => si.ctle(x, ...c) : undefined);
  if (auto) {
    let bestH = -Infinity;
    for (let dc = 0; dc >= -18; dc -= 1.5) { const c: [number, number, number, number] = [dc, nyq * 10 ** (dc / 20), nyq, 4 * nyq], h = si.eye(pulse(c), { ...base, nsym: Math.min(nsym, 600) }).heightBest; if (h > bestH) { bestH = h; ctle = c; } }
  }
  const p = pulse(ctle), fv = o.get('FFE'), taps = o.has('FFETaps') ? nums(o.get('FFETaps')) : [1, 2];
  if (fv && isText(fv)) { if (fv.v.toLowerCase() !== 'auto') throw new LabError("'FFE' is the taps or 'auto'."); base.ffe = si.ffeZeroForcing(p.p, p.cursor, spu, taps[0], taps[1] ?? 2); base.ffePre = taps[0]; }
  else if (fv) { base.ffe = nums(fv); base.ffePre = Math.round(optNum(o, 'FFEPre', 1)); if (base.ffePre < 0 || base.ffePre >= base.ffe.length) throw new LabError("'FFEPre' counts the pre-cursor taps, fewer than the taps."); }
  const e = si.eye(p, base);
  if (nout > 0) return [record([['Height', e.heightBest], ['HeightAtBER', e.heightAtBer], ['Width', e.width], ['WidthAtBER', e.widthAtBer], ['BER', e.ber], ['BestPhase', e.best], ['Bathtub', row(e.bath)], ['DFETaps', row(e.dfeTaps)], ['FFETaps', row(base.ffe)], ['CTLE', ctle ? row(ctle) : mat(0, 0)], ['MaskPass', +e.maskPass], ['MainCursor', e.mainCursor]])];
  const xs: number[] = [], ys: number[] = [];
  e.traces.forEach((tr, k) => { tr.forEach((v, j) => { xs.push((j - spu) / spu + e.jitter[k]); ys.push(v); }); xs.push(NaN); ys.push(NaN); });
  call(lab, 'subplot', num(1), num(2), num(1)); call(lab, 'plot', row(xs), row(ys), str('Color'), str('#2563eb'), str('LineWidth'), num(0.5));
  call(lab, 'xlabel', str('Time (UI)')); call(lab, 'ylabel', str('Volts')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`${mod} ${(rate / 1e9).toFixed(1)} GBd: eye ${(1000 * e.heightBest).toFixed(0)} mV × ${e.width.toFixed(2)} UI${mk ? (e.maskPass ? ', mask passes' : ', mask fails') : ''}`));
  const ph = e.bath.map((_, j) => (j - (spu >> 1)) / spu);
  call(lab, 'subplot', num(1), num(2), num(2)); call(lab, 'semilogy', row(ph), row(e.bath), str('LineWidth'), num(1.5)); call(lab, 'hold', str('on'));
  call(lab, 'semilogy', row([ph[0], ph[ph.length - 1]]), row([base.ber, base.ber]), str('r--')); call(lab, 'hold', str('off'));
  call(lab, 'xlabel', str('Sampling phase (UI)')); call(lab, 'ylabel', str('Bit error rate')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Bathtub: BER ${e.ber.toExponential(1)} at the best phase, ${e.widthAtBer.toFixed(2)} UI open at ${base.ber.toExponential(0)}`));
  return [];
});
def('pdnImpedance', (a, nout, lab) => {
  const f = nums(a[0], 'The frequencies (Hz)'), o = options(a, 1, ['VRM', 'Caps', 'Plane', 'Die', 'Target', 'Step'], 'pdnImpedance'), parts: si.PdnPart[] = [];
  if (o.has('VRM')) { const v = nums(o.get('VRM')); parts.push({ kind: 'vrm', count: 1, c: 0, esr: v[0], esl: v[1] ?? 0 }); }
  if (o.has('Caps')) { const c = toMat(o.get('Caps')!); if (c.c !== 4) throw new LabError("'Caps' rows are [count C ESR ESL] (F, Ω, H; ESL with its vias)."); for (let r = 0; r < c.r; r++) parts.push({ kind: 'cap', count: c.d[r], c: c.d[r + c.r], esr: c.d[r + 2 * c.r], esl: c.d[r + 3 * c.r] }); }
  for (const k of ['Plane', 'Die'] as const) if (o.has(k)) { const v = nums(o.get(k)); parts.push({ kind: k === 'Plane' ? 'plane' : 'die', count: 1, c: v[0], esr: v[1] ?? 1e-4, esl: v[2] ?? 0 }); }
  if (!parts.length || parts.some((p) => p.kind !== 'vrm' && !(p.c > 0 && p.count > 0)) || f.some((x) => !(x > 0))) throw new LabError("pdnImpedance(f, 'VRM', [R L], 'Caps', [n C ESR ESL; …], 'Plane', [C R L], 'Die', [C R L]): frequencies and capacitances above 0.");
  const st = o.has('Step') ? nums(o.get('Step')) : null, target = optNum(o, 'Target', NaN);
  const r = si.pdn(parts, target, f, st ? { dI: st[0], tr: st[1] ?? 1e-9, dur: st[2] ?? 20e-6 } : undefined);
  if (nout > 0) return [row(r.Z), record([['Peaks', r.peaks.length ? mat(r.peaks.length, 2, [...r.peaks.map((q) => q[0]), ...r.peaks.map((q) => q[1])]) : mat(0, 2)], ['Over', row(r.over)], ['Target', target], ...(r.droop ? [['DroopT', row(r.droop.t)], ['Droop', row(r.droop.v)], ['WorstDroop', r.droop.worst]] as [string, Value][] : [])])];
  if (r.droop) call(lab, 'subplot', num(2), num(1), num(1));
  call(lab, 'loglog', row(f), row(r.Z), str('LineWidth'), num(2));
  if (Number.isFinite(target)) { call(lab, 'hold', str('on')); call(lab, 'loglog', row([f[0], f[f.length - 1]]), row([target, target]), str('r--')); call(lab, 'hold', str('off')); }
  call(lab, 'xlabel', str('Frequency (Hz)')); call(lab, 'ylabel', str('|Z| (Ω)')); call(lab, 'grid', str('on'));
  const worst = r.peaks.reduce((b, q) => (q[1] > b[1] ? q : b), [0, 0]);
  call(lab, 'title', str(Number.isFinite(target) ? (r.over.length ? `Over the ${(target * 1e3).toFixed(2)} mΩ target from ${r.over[0].toExponential(1)} Hz; worst ${(worst[1] * 1e3).toFixed(1)} mΩ at ${worst[0].toExponential(1)} Hz` : 'Under the target everywhere') : 'PDN impedance'));
  if (r.droop) { call(lab, 'subplot', num(2), num(1), num(2)); lines(lab, r.droop.t.map((x) => x * 1e6), [r.droop.v.map((x) => x * 1e3)], [], 'Time (µs)', 'Rail change (mV)', `Load step ${st![0]} A: worst droop ${(r.droop.worst * 1e3).toFixed(1)} mV`); }
  return [];
});
def('irDrop', (a, nout, lab) => {
  const o = options(a, 0, ['Size', 'Grid', 'Copper', 'VRM', 'Loads', 'Voids', 'Limit', 'Jmax'], 'irDrop'), rect = (k: string, n: number) => { if (!o.has(k)) return []; const m = toMat(o.get(k)!); if (m.c !== n) throw new LabError(`irDrop's '${k}' rows are [x y w h${n === 5 ? ' value' : ''}] (m).`); return Array.from({ length: m.r }, (_, r) => Array.from({ length: n }, (_, c) => m.d[r + c * m.r])); };
  const sz = o.has('Size') ? nums(o.get('Size')) : [0.1, 0.08], gr = o.has('Grid') ? nums(o.get('Grid')).map(Math.round) : [100, 80];
  if (!(sz[0] > 0 && sz[1] > 0 && gr[0] >= 4 && gr[1] >= 4 && gr[0] * gr[1] <= 90000)) throw new LabError("irDrop: 'Size' [W H] m above 0, 'Grid' [nx ny] at least 4 each, at most 90,000 cells.");
  const p: si.Plane = { W: sz[0], H: sz[1], nx: gr[0], ny: gr[1], oz: optNum(o, 'Copper', 1), vrm: rect('VRM', 5), loads: rect('Loads', 5), voids: rect('Voids', 4) };
  let r: ReturnType<typeof si.irDrop>;
  try { r = si.irDrop(p); } catch (e) { throw new LabError((e as Error).message); }
  const limit = optNum(o, 'Limit', 3), jmax = optNum(o, 'Jmax', Infinity), drop = Float64Array.from(r.V, (v) => r.vmax - v);
  const grid = (d: ArrayLike<number>) => { const m = mat(r.ny, r.nx); for (let j = 0; j < r.ny; j++) for (let i = 0; i < r.nx; i++) m.d[j + i * r.ny] = d[j * r.nx + i]; return m; };
  const overV = [...drop].filter((v) => v > (limit / 100) * r.vmax).length, overJ = [...r.J].filter((v) => v > jmax).length;
  if (nout > 0) return [record([['V', grid(r.V)], ['Drop', grid(drop)], ['J', grid(r.J)], ['Worst', r.worst], ['LoadV', row(r.loadV)], ['CellsOverDrop', overV], ['CellsOverJ', overJ], ['Iterations', r.iterations]])];
  call(lab, 'imagesc', row([0, p.W * 1000]), row([0, p.H * 1000]), grid([...drop].map((v) => v * 1000))); call(lab, 'colorbar'); call(lab, 'axis', str('xy')); call(lab, 'axis', str('equal'));
  call(lab, 'xlabel', str('x (mm)')); call(lab, 'ylabel', str('y (mm)'));
  call(lab, 'title', str(`DC drop (mV): worst ${(r.worst * 1000).toFixed(1)} mV (${((100 * r.worst) / r.vmax).toFixed(2)}%)${overV ? `, ${overV} cells over ${limit}%` : ''}${overJ ? `, ${overJ} over ${jmax} A/mm²` : ''}`));
  return [];
});
