import { LabError } from './parse';
import { textOf, type Lab } from './interp';
import { cmat, imOf, mat, num, str, toMat, type Value } from './values';
import { fileBytes, fileText, hasFile, writeFileText } from './files';
import * as ami from './ami';
import { filterImpulse, readAnalog, throughFrontEnds, type Analog } from './ibis-analog';
import { analogImpulse, arrivalResponse, convolve, idealEnd } from './ibis-sim';
import { bytesToB64, hasNative } from './native';
import * as si from './si';
import { call, col, def, field, isText, lines, need, nums, options, optNum, optText, record, row, rows } from './sci-kit';

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
/** An IBIS-AMI model struct (from amiModel) back as the flows' model, its library from Hyperion's files or this
 * computer (a full path, read by the computer app). */
function modelOf(lab: Lab, v: Value | undefined, who: string): ami.Model | null {
  if (v === undefined) return null;
  if (v.k !== 'struct' || !v.f.has('Executable') || !v.f.has('Parameters')) throw new LabError(`'${who}' takes a model from amiModel.`);
  const exe = textOf(v.f.get('Executable')!), name = exe.split(/[\\/]/).pop() || exe;
  const file = hasFile(lab, exe) ? { name, bytes: bytesToB64(fileBytes(lab, exe)) } : { name, path: exe };
  const an = v.f.get('Analog'), analog = an?.k === 'struct' ? analogOf(an, who) : undefined;
  return { name: textOf(v.f.get('Name')!), ...(analog ? { analog } : {}), file, params: textOf(v.f.get('Parameters')!), info: { root: textOf(v.f.get('Name')!), params: [], reserved: {}, initReturnsImpulse: field(v, 'InitReturnsImpulse', who) === 1, getWaveExists: field(v, 'GetWaveExists', who) === 1, ignoreBits: field(v, 'IgnoreBits', who), modulation: 'NRZ', maxAggressors: v.f.has('MaxInitAggressors') ? field(v, 'MaxInitAggressors', who) : 16, ...(v.f.has('BCIProtocol') && textOf(v.f.get('BCIProtocol')!) ? { bci: { protocol: textOf(v.f.get('BCIProtocol')!), interval: field(v, 'BCIInterval', who), training: field(v, 'BCITraining', who) } } : {}) } };
}
/** A model's analog buffer (M583) as a struct, and back (M585: with its I-V tables, supply and falling edge). */
const ANALOG: [string, keyof Analog][] = [['Driver', 'rs'], ['Termination', 'rt'], ['Ccomp', 'cComp'], ['Rpkg', 'rPkg'], ['Lpkg', 'lPkg'], ['Cpkg', 'cPkg'], ['Rise', 'rise'], ['Fall', 'fall'], ['Vcc', 'vcc']];
const TABLES: [string, 'pu' | 'pd' | 'gc' | 'pc'][] = [['PullUp', 'pu'], ['PullDown', 'pd'], ['GndClamp', 'gc'], ['PowerClamp', 'pc']];
/** M586: the edges' pull-up and pull-down weights from the waveform tables, rows [t ku kd]. */
const EDGES: [string, 'kr' | 'kf'][] = [['RisingK', 'kr'], ['FallingK', 'kf']];
const analogRecord = (a: Analog) => record([['ModelType', a.type], ['Corner', a.corner], ...ANALOG.map(([k, f]) => [k, a[f] as number] as [string, number]), ...TABLES.map(([k, f]) => [k, a[f].length ? rows(a[f]) : mat(0, 0)] as [string, Value]), ...EDGES.flatMap(([k, f]) => (a[f]?.length ? [[k, rows(a[f]!)]] as [string, Value][] : [])), ['Notes', a.notes.join('; ')]]);
function analogOf(v: Value, who: string): Analog {
  const has = (k: string) => v.k === 'struct' && v.f.has(k);
  const a: Analog = { type: has('ModelType') ? textOf((v as { f: Map<string, Value> }).f.get('ModelType')!) : '', corner: has('Corner') ? textOf((v as { f: Map<string, Value> }).f.get('Corner')!) : 'typ', rs: 50, rt: 50, cComp: 0, rPkg: 0, lPkg: 0, cPkg: 0, rise: 0, fall: 0, vcc: 1, pu: [], pd: [], gc: [], pc: [], notes: [] };
  for (const [k, f] of ANALOG) if (has(k)) { const x = field(v, k, who); if (!(x >= 0) || ((f === 'rs' || f === 'rt' || f === 'vcc') && !(x > 0))) throw new LabError(`${who}: the model's Analog.${k} must be above 0.`); (a[f] as number) = x; }
  for (const [k, f] of TABLES) if (has(k)) {
    const M = toMat((v as { f: Map<string, Value> }).f.get(k)!);
    if (M.d.length && M.c !== 2) throw new LabError(`${who}: the model's Analog.${k} is a table of [V I] rows.`);
    a[f] = Array.from({ length: M.r }, (_, r) => [M.d[r], M.d[M.r + r]]);
  }
  for (const [k, f] of EDGES) if (has(k)) {
    const M = toMat((v as { f: Map<string, Value> }).f.get(k)!);
    if (!M.d.length) continue;
    if (M.c !== 3) throw new LabError(`${who}: the model's Analog.${k} is a table of [t ku kd] rows.`);
    a[f] = Array.from({ length: M.r }, (_, r) => [M.d[r], M.d[M.r + r], M.d[2 * M.r + r]]);
  }
  return a;
}
/** The channel through the chips' own buffers (M585): when either model brings its IBIS buffer, the channel's
 * scattering responses driven and received by them in time, an ideal end standing in for the other; long enough for
 * echoes to come and go (three times the matched response), any CTLE after it. A 4-port (M586): its sixteen
 * single-ended responses, each leg of the pair its own buffer. The near-end crosstalk heard through the receiver as it
 * is, echoes between the two ends included (M586). Otherwise the plain impulse response. */
function analogChannel(S: ReturnType<typeof sOf>, rate: number, spu: number, h: number[], dt: number, ctle: [number, number, number, number] | null, tx: ami.Model | null, rx: ami.Model | null) {
  const ta = tx?.analog, ra = rx?.analog;
  if (!ta && !ra) return { h, messages: [] as string[] };
  const N = S.n === 4 ? 4 : 2, resp = (i: number, j: number) => si.sampled(S.f, S.s.map((m) => m[i][j]), rate, spu);
  const s21 = resp(N / 2, 0), n = Math.min(s21.length, 3 * h.length);
  const M = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i === N / 2 && j === 0 ? s21 : resp(i, j)).slice(0, n)));
  const tA = ta ?? idealEnd(S.zref, 'tx'), rA = ra ?? idealEnd(S.zref, 'rx'), r = analogImpulse(M, n, dt, S.zref, tA, rA);
  const fe = (x: number[]) => (ctle ? filterImpulse(x, dt, (f) => si.ctle(f, ...ctle)) : x);
  const hh = fe(r.h), pk = Math.max(...hh.map(Math.abs));
  let last = hh.length; while (last > h.length && Math.abs(hh[last - 1]) < 1e-5 * pk) last--;
  const rise = fe(r.rise).slice(0, last), fall = fe(r.fall).slice(0, last), diff = Math.max(...rise.map((v, k) => Math.abs(v - fall[k]))) / (pk || 1);
  const messages: string[] = [], edges = (a: typeof ta) => (a!.kr || a!.kf ? 'edges from its waveform tables' : `edges ${(a!.rise * 1e12).toPrecision(3)} / ${(a!.fall * 1e12).toPrecision(3)} ps`);
  if (ta) messages.push(`${tx!.name} analog (${ta.corner}): driver ${ta.rs.toPrecision(3)} ohms near its rails, C_comp ${(ta.cComp * 1e12).toPrecision(3)} pF, ${edges(ta)}${ta.notes.length ? `; ${ta.notes.join('; ')}` : ''}`);
  if (ra) messages.push(`${rx!.name} analog (${ra.corner}): termination ${ra.rt.toPrecision(3)} ohms at mid-supply, C_comp ${(ra.cComp * 1e12).toPrecision(3)} pF${ra.notes.length ? `; ${ra.notes.join('; ')}` : ''}`);
  if (N === 4) messages.push('Each leg of the differential pair driven and received by its own buffer (the transmitter\'s legs switching opposite ways)');
  messages.push(`The buffers' rising and falling edges differ by ${(100 * diff).toFixed(1)}% of the response's peak (their average used)`);
  // the near end's coupling arrives at the receiver's pin: heard through its buffer, bouncing between the ends (worked out once, when asked)
  // (M587) each side a neighbour can sit on its own echo path: on a pair, one beside either leg or a pair beside it
  const g = new Map<number, number[]>();
  const near = (x: number[], side: 0 | 1 | -1 = 0) => {
    const k = N === 4 ? side : 0;
    if (!g.has(k)) g.set(k, fe(arrivalResponse(M, n, dt, S.zref, tA, rA, k)));
    return convolve(throughFrontEnds(x, dt, ta, null, S.zref), g.get(k)!, x.length).map((v) => v * dt);
  };
  return { h: hh.slice(0, last), rise, fall, messages, near };
}
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
  const w = 'eyeDiagram', o = options(a, 2, ['Modulation', 'PRBS', 'Symbols', 'Swing', 'FFE', 'FFETaps', 'FFEPre', 'CTLE', 'DFE', 'RJ', 'DJ', 'Noise', 'BER', 'Crosstalk', 'Mask', 'SamplesPerUI', 'Rise', 'Seed', 'TxModel', 'RxModel', 'Flow'], w);
  const tx = modelOf(lab, o.get('TxModel'), 'TxModel'), rx = modelOf(lab, o.get('RxModel'), 'RxModel'), models = !!(tx || rx), most = models ? 100000 : 20000;
  const mod = optText(o, 'Modulation', 'NRZ').toUpperCase(), spu = Math.round(optNum(o, 'SamplesPerUI', 16)), nsym = Math.round(optNum(o, 'Symbols', models ? 5000 : 2000));
  if ((mod !== 'NRZ' && mod !== 'PAM4') || !(rate > 0 && spu >= 4 && spu <= 64 && nsym >= 100 && nsym <= most)) throw new LabError(`${w}: 'Modulation' 'NRZ' or 'PAM4', 'SamplesPerUI' 4 to 64, 'Symbols' 100 to ${most.toLocaleString('en')}.`);
  const H = through(S), rise = optNum(o, 'Rise', 0), xt = crosstalkOf(o.get('Crosstalk')), paths = pathsOf(S, xt, rate, Math.round(optNum(o, 'SamplesPerUI', 16))), mk = o.has('Mask') ? nums(o.get('Mask')) : null;
  const base: si.Eye = { rate, spu, pam4: mod === 'PAM4', order: Math.round(optNum(o, 'PRBS', 7)), nsym, swing: optNum(o, 'Swing', 0.8), ffe: [], ffePre: 0, dfe: Math.round(optNum(o, 'DFE', 0)), rj: optNum(o, 'RJ', 0), dj: optNum(o, 'DJ', 0), noise: optNum(o, 'Noise', 0), ber: optNum(o, 'BER', 1e-12), xtalk: xt, xtalkPath: paths, ...(mk ? { mask: [mk[0], mk[1]] as [number, number] } : {}), seed: Math.round(optNum(o, 'Seed', 1)) };
  if (![7, 9, 11, 15, 23, 31].includes(base.order) || base.dfe < 0 || base.dfe > 20) throw new LabError(`${w}: 'PRBS' 7, 9, 11, 15, 23 or 31; 'DFE' 0 to 20 taps.`);
  const cv = o.get('CTLE'), auto = cv && isText(cv) && cv.v.toLowerCase() === 'auto';
  let ctle = auto ? null : ctleOf(cv);
  const nyq = rate / 2, pulse = (c: typeof ctle) => si.pulseResponse(S.f, H, rate, spu, 512, rise, c ? (x) => si.ctle(x, ...c) : undefined);
  if (auto) {
    let bestH = -Infinity;
    for (let dc = 0; dc >= -18; dc -= 1.5) { const c: [number, number, number, number] = [dc, nyq * 10 ** (dc / 20), nyq, 4 * nyq], h = si.eye(pulse(c), { ...base, nsym: Math.min(nsym, 600) }).heightBest; if (h > bestH) { bestH = h; ctle = c; } }
  }
  const amiOut = models ? amiEye(S, H, rate, spu, base, tx, rx, optText(o, 'Flow', 'timedomain').toLowerCase(), ctle) : null;
  const p = amiOut?.pulse ?? pulse(ctle), fv = o.get('FFE'), taps = o.has('FFETaps') ? nums(o.get('FFETaps')) : [1, 2];
  if (fv && isText(fv)) { if (fv.v.toLowerCase() !== 'auto') throw new LabError("'FFE' is the taps or 'auto'."); base.ffe = si.ffeZeroForcing(p.p, p.cursor, spu, taps[0], taps[1] ?? 2); base.ffePre = taps[0]; }
  else if (fv) { base.ffe = nums(fv); base.ffePre = Math.round(optNum(o, 'FFEPre', 1)); if (base.ffePre < 0 || base.ffePre >= base.ffe.length) throw new LabError("'FFEPre' counts the pre-cursor taps, fewer than the taps."); }
  const e = amiOut?.measured ? { ...amiOut.measured, dfeTaps: [] as number[], mainCursor: amiOut.main } : si.eye(p, base, amiOut?.agg);
  if (nout > 0) return [record([...(amiOut ? [['AMI', amiOut.record]] as [string, Value][] : []), ['Height', e.heightBest], ['HeightAtBER', e.heightAtBer], ['Width', e.width], ['WidthAtBER', e.widthAtBer], ['BER', e.ber], ['BestPhase', e.best], ['Bathtub', row(e.bath)], ['DFETaps', row(e.dfeTaps)], ['FFETaps', row(base.ffe)], ['CTLE', ctle ? row(ctle) : mat(0, 0)], ['MaskPass', +e.maskPass], ['MainCursor', e.mainCursor]])];
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
/** The eye through IBIS-AMI models: the channel's impulse response (and any CTLE) through the statistical or the
 * time-domain flow; statistical gives a pulse for the usual eye, time-domain a received waveform measured as it is
 * (the receiver's own equaliser replaces FFE and DFE), its first symbols left out while the models adapt. */
/** The aggressors 'Crosstalk' makes, one row [kNext kFext] (or [kNext kFext side]) per neighbouring line, as impulse
 * responses for the AMI flows: NEXT an edge (the near end's coupling) heard through the receiver along its own echo
 * path (`near`, by the side it sits on), FEXT the channel's own response differentiated (the far end's), each with
 * its own PRBS in the time-domain flow (the same scale and seeds as the eye without models). */
function aggressorsOf(h: number[], dt: number, spu: number, e: si.Eye, withSignals: boolean, near: (x: number[], side: 0 | 1 | -1) => number[] = (x) => x): ami.Aggressor[] {
  const out: ami.Aggressor[] = [], sig = (i: number) => {
    if (!withSignals) return undefined;
    const a = si.symbols(si.prbs(e.order, e.pam4 ? 2 * e.nsym : e.nsym, e.seed + 77 + 74 * i), e.pam4), x = new Array(a.length * spu);
    for (let k = 0; k < a.length; k++) for (let j = 0; j < spu; j++) x[k * spu + j] = (a[k] * e.swing) / 2;
    return x;
  };
  // (M588) a row's line just inside it on the same side, (M589) the first line on the other side of the victim
  const rows = si.crosstalkRows(e.xtalk), at: { n?: number; f?: number }[] = [];
  e.xtalk.forEach(([kn, kf, side], r) => {
    const q = rows.inner[r], inner = q === undefined ? undefined : at[q].n ?? at[q].f, path = e.xtalkPath?.[r], me: { n?: number; f?: number } = {};
    if (kn) {
      let hn = new Array(h.length).fill(0); hn[0] = (kn * spu) / 4 / dt; hn[1] = -hn[0];
      if (path) hn = convolve(hn, path, hn.length);
      me.n = out.length; out.push({ h: near(hn, side ?? 0), x: sig(out.length), inner, share: kn });
    }
    if (kf) { me.f = out.length; out.push({ h: h.map((v, n) => (n ? v - h[n - 1] : 0) * kf * (spu / 4)), x: sig(out.length), inner, share: kf }); }
    at.push(me);
  });
  // (M589) second order: a line further out leaks into the line inside it as that one leaks into the victim (equally
  // spaced) and a share of it goes on; outside a link (where the lines really hear each other) as its own entry, with
  // the outer line's signal. And the first line on each side told of the one across the victim.
  e.xtalk.forEach((_, r) => {
    const q = rows.inner[r];
    if (q !== undefined) for (const k of ['n', 'f'] as const) {
      const mine = at[r][k], theirs = at[q][k];
      if (mine !== undefined && theirs !== undefined) out.push({ h: out[theirs].h.map((v) => v * out[theirs].share!), x: out[mine].x, of: mine });
    }
    const o = rows.across[r], mine = at[r].n ?? at[r].f, theirs = o === undefined ? undefined : at[o].n ?? at[o].f;
    if (mine !== undefined && theirs !== undefined) out[mine].across = theirs;
  });
  return out;
}
/** 'Crosstalk': [kNext kFext], or one row per neighbouring line [kNext kFext], [kNext kFext side] or [kNext kFext side
 * at] (side 1 beside the pair's first leg, −1 its second, 0 a neighbouring pair; with several rows and no side given,
 * they sit on alternate sides, M584's one on each side, the later rows further out; at, M588, where along the line the
 * neighbour runs beside it: 0 at the receiver's end, 1 at the transmitter's; a fifth column, M589, where it stops:
 * beside the line all along from at to there, its coupling spread evenly over that stretch). */
function crosstalkOf(v: Value | undefined): si.Eye['xtalk'] {
  if (!v) return [];
  const M = toMat(v);
  if (M.r * M.c === 0) return [];
  if (!(M.c >= 2 && M.c <= 5) && !(M.r === 1 && M.c <= 5)) throw new LabError("'Crosstalk' is [kNext kFext], or a row per neighbour [kNext kFext], [kNext kFext side], [kNext kFext side at] or [kNext kFext side from to].");
  return Array.from({ length: M.r }, (_, r) => {
    const at = (c: number) => (c < M.c ? M.d[c * M.r + r] : undefined), sd = at(2), where = at(3) ?? 0;
    if (sd !== undefined && ![0, 1, -1].includes(sd)) throw new LabError("'Crosstalk': a neighbour's side is 1 (beside the first leg), -1 (the second) or 0 (a neighbouring pair).");
    const to = at(4) ?? where;
    if (!(where >= 0 && where <= 1 && to >= where && to <= 1)) throw new LabError("'Crosstalk': where a neighbour runs beside the line is 0 (the receiver's end) to 1 (the transmitter's), a stretch from the nearer place to the further.");
    const side = (sd ?? (M.r > 1 ? (r % 2 ? -1 : 1) : 0)) as 0 | 1 | -1;
    return [at(0) ?? 0, at(1) ?? 0, side, where, to];
  });
}
/**
 * The way back from a neighbour that runs beside the line partway along (M588): its near-end wave starts `at` of the way
 * down and comes back to the receiver over that part twice, the channel's own transfer raised to 2·at (its loss and
 * delay, a uniform line's), per sample every dt. Whole symbols of delay are dropped: the neighbour's pattern is
 * independent of the victim's, so only the part of a symbol (and the loss) changes what the eye sees. Over a stretch
 * (M589) the waves of 24 places along it are averaged, the coupling spread evenly: the near-end noise lasts the round
 * trip over the stretch instead of one edge.
 */
function nextPath(f: number[], H: si.C[], from: number, to: number, rate: number, spu: number): number[] {
  let u = 0, prev = 0;
  const mag = H.map(([re, im]) => Math.hypot(re, im)), ph = H.map(([re, im], k) => {
    const p = Math.atan2(im, re);
    u = k ? u + p - prev - 2 * Math.PI * Math.round((p - prev) / (2 * Math.PI)) : p; prev = p;
    return u;
  });
  // (M589) a stretch: the near-end waves of every place along it, averaged (the coupling spread evenly), 24 places
  const m = to > from ? 24 : 1, sum: number[] = [];
  let pk = 0;
  for (let i = 0; i < m; i++) {
    const a = m > 1 ? from + ((to - from) * (i + 0.5)) / m : from;
    const r = si.impulseResponse(f, H.map((_, k): si.C => { const g = mag[k] ** (2 * a); return [g * Math.cos(2 * a * ph[k]), g * Math.sin(2 * a * ph[k])]; }), rate, spu, 256);
    r.h.forEach((v, k) => { sum[k] = (sum[k] ?? 0) + (v * r.dt) / m; });
    // whole symbols of delay before the nearest place's wave are dropped
    if (!i) for (let k = 1; k < r.h.length; k++) if (Math.abs(r.h[k]) > Math.abs(r.h[pk])) pk = k;
  }
  return sum.slice(spu * Math.floor(pk / spu));
}
/** The rows' ways back (only for those partway along or over a stretch). */
const pathsOf = (S: ReturnType<typeof sOf>, xt: si.Eye['xtalk'], rate: number, spu: number) => {
  const H = through(S);
  return xt.map((x) => (x[3] || x[4] ? nextPath(S.f, H, x[3] ?? 0, x[4] ?? x[3] ?? 0, rate, spu) : undefined));
};
/** The eye through IBIS-AMI models: the channel's impulse response (and any CTLE) and the aggressors' through the
 * statistical or the time-domain flow; statistical gives pulses for the usual eye, time-domain a received waveform
 * measured as it is (the receiver's own equaliser replaces FFE and DFE), its first symbols left out while the models
 * adapt. */
function amiEye(S: ReturnType<typeof sOf>, H: si.C[], rate: number, spu: number, e: si.Eye, tx: ami.Model | null, rx: ami.Model | null, flowName: string, ctle: [number, number, number, number] | null) {
  if (flowName !== 'timedomain' && flowName !== 'statistical') throw new LabError("'Flow' is 'timedomain' or 'statistical'.");
  const plain = si.impulseResponse(S.f, H, rate, spu, 512, ctle ? (x) => si.ctle(x, ...ctle) : undefined), dt = plain.dt, ui = 1 / rate;
  const an = analogChannel(S, rate, spu, plain.h, dt, ctle, tx, rx), h = an.h;
  if (flowName === 'statistical') {
    const gs = aggressorsOf(h, dt, spu, e, false, an.near), f = ami.flow(h, dt, ui, tx, rx, null, gs), pulse = si.pulseFromImpulse(f.hRx, dt, spu);
    // (M589) a second-order path added to its outer line's own pulse (the same signal)
    const agg: number[][] = [];
    f.aggRx.forEach((c, i) => { const p = si.pulseFromImpulse(c, dt, spu).p, of = gs[i]?.of; if (of === undefined) agg.push(p); else { const t = agg[of]; p.forEach((v, j) => { t[j] = (t[j] ?? 0) + v; }); } });
    f.messages.unshift(...an.messages);
    return { pulse, agg, measured: null, main: pulse.p[pulse.cursor], record: record([['Flow', 'statistical'], ['Impulse', row(f.hRx)], ['Aggressors', f.aggRx.length], ['Messages', str(f.messages.join('\n'))], ['ParamsOut', str(f.paramsOut.join('\n'))]]) };
  }
  const a = si.symbols(si.prbs(e.order, e.pam4 ? 2 * e.nsym : e.nsym, e.seed), e.pam4), x = new Array(a.length * spu);
  for (let k = 0; k < a.length; k++) for (let j = 0; j < spu; j++) x[k * spu + j] = (a[k] * e.swing) / 2;
  const f = ami.flow(h, dt, ui, tx, rx, x, aggressorsOf(h, dt, spu, e, true, an.near)), z = f.z!, al = si.alignWave(z, a, spu, Math.min(z.length - spu, h.length + 64 * spu));
  const ignore = Math.ceil(Math.max(tx?.info.ignoreBits ?? 0, rx?.info.ignoreBits ?? 0) / (e.pam4 ? 2 : 1));
  if (a.length < ignore + 500) throw new LabError(`The models adapt over their first ${ignore} symbols (Ignore_Bits): give 'Symbols' at least ${ignore + 500}.`);
  const y = z.slice(al.delay), measured = si.measure(y, a, al.main, { ...e, dfe: 0, ffe: [] }, Math.max(16, ignore + 8));
  const clocks = f.clocks.length > 1 ? f.clocks : [];
  f.messages.unshift(...an.messages);
  return { pulse: null, agg: undefined, measured, main: al.main, record: record([['Flow', 'timedomain'], ['Wave', row(z)], ['Delay', al.delay * dt], ['Clocks', row(clocks)], ['Aggressors', f.aggRx.length], ['UsedGetWave', row(f.usedGetWave.map(Number))], ...bciFields(f), ['Messages', str(f.messages.join('\n'))], ['ParamsOut', str(f.paramsOut.join('\n'))]]) };
}
/** A back-channel link's record (M579): the protocol, when each block ran (UI) and what the transmitter reported. */
const bciFields = (f: ami.FlowOut): [string, Value][] => (f.bci ? [['BCI', record([['Protocol', f.bci.protocol], ['UI', row(f.bci.history.map((x) => x.ui))], ['TxParams', str(f.bci.history.map((x) => x.tx).join('\n'))], ['RxParams', str(f.bci.history.map((x) => x.rx).join('\n'))], ['Files', str(f.bci.files.join(', '))], ['AggressorTxParams', str(f.bci.lanes.map((l) => l.tx).join('\n'))]])]] : []);
def('amiModel', (a, nout, lab) => {
  let exe = a[0] ? textOf(a[0]) : '', src = a[1] ? textOf(a[1]) : '', picked = '', analog: Analog | null = null;
  const pairs = new Map<string, Value>();
  for (let i = 2; i < a.length; i += 2) {
    if (!isText(a[i]) || a[i + 1] === undefined) throw new LabError('amiModel: the settings come as name, value pairs.');
    pairs.set((a[i] as { v: string }).v, a[i + 1]);
  }
  // From an IBIS file (M578): the model's [Algorithmic Model] picks the library for this computer; its files are looked
  // for in Hyperion's files, or the library in 'Folder' on this computer.
  if (/\.ibs$/i.test(exe)) {
    const models = ami.readIbis(fileText(lab as Lab, exe)), m = models.find((x) => x.name.toLowerCase() === src.toLowerCase());
    if (!m) throw new LabError(`${exe} has no model "${src}" with an [Algorithmic Model] (it has: ${models.map((x) => x.name).join(', ') || 'none'}).`);
    const folder = pairs.has('Folder') ? textOf(pairs.get('Folder')!) : '', role = pairs.has('Role') ? textOf(pairs.get('Role')!).toLowerCase() : '';
    const corner = pairs.has('Corner') ? textOf(pairs.get('Corner')!).toLowerCase() : 'typ', useAnalog = !pairs.has('Analog') || toMat(pairs.get('Analog')!).d[0] !== 0;
    if (!['typ', 'min', 'max'].includes(corner)) throw new LabError("amiModel: 'Corner' is 'typ', 'min' or 'max'.");
    pairs.delete('Folder'); pairs.delete('Role'); pairs.delete('Corner'); pairs.delete('Analog');
    // the [Model]'s pads, package and driver (M583), applied around the channel in the flows
    if (useAnalog) analog = readAnalog(fileText(lab as Lab, exe), m.name, corner);
    const ex = ami.pickExecutable(m, role), base = (f: string) => f.split(/[\\/]/).pop()!;
    exe = hasFile(lab as Lab, base(ex.lib)) ? base(ex.lib) : folder ? `${folder.replace(/[\\/]+$/, '')}/${base(ex.lib)}` : '';
    if (!exe) throw new LabError(`Put ${base(ex.lib)} in your files, or give where it is on this computer: amiModel('${a[0] && textOf(a[0])}', '${src}', 'Folder', 'C:\\models').`);
    if (!hasFile(lab as Lab, base(ex.ami))) throw new LabError(`Put the model's settings file ${base(ex.ami)} in your files.`);
    src = base(ex.ami); picked = ex.platform;
  }
  if (!/\.(dll|so|dylib)$/i.test(exe) || !src) throw new LabError("amiModel('model.dll', 'model.ami', 'name', value, …) or amiModel('device.ibs', 'model name', …): the library (in your files, or its full path on this computer) and its .ami file (in your files, or its text).");
  const info = ami.readAmi(src.includes('(') ? src : fileText(lab as Lab, src)), choices = new Map<string, string>();
  for (const [k, v] of pairs) choices.set(k, isText(v) ? v.v : String(toMat(v).d[0]));
  const params = ami.paramString(info, choices), inputs = info.params.filter((p) => /^(in|inout)$/i.test(p.usage));
  const m = record([['Type', 'amiModel'], ['Name', info.root], ['Executable', exe], ['Parameters', params], ['InitReturnsImpulse', +info.initReturnsImpulse], ['GetWaveExists', +info.getWaveExists], ['IgnoreBits', info.ignoreBits], ['MaxInitAggressors', info.maxAggressors], ['Modulation', info.modulation], ['Platform', picked], ['BCIProtocol', info.bci?.protocol ?? ''], ['BCIInterval', info.bci?.interval ?? 0], ['BCITraining', info.bci?.training ?? 0], ...(analog ? [['Analog', analogRecord(analog)]] as [string, Value][] : [])]);
  if (nout > 0) return [m];
  const lines = [`IBIS-AMI model ${info.root} (${exe}): Init ${info.initReturnsImpulse ? 'returns the equalised impulse' : 'does not return an impulse'}, GetWave ${info.getWaveExists ? 'yes' : 'no'}${info.ignoreBits ? `, adapts over ${info.ignoreBits} bits` : ''}.`, 'Settings you can choose:'];
  for (const p of inputs) lines.push(`  ${p.path.join('.')} = ${p.value ?? '(none)'}${p.list ? `  one of ${p.list.join(' ')}` : p.range ? `  ${p.range[1]} to ${p.range[2]}` : ''}${p.description ? `  ${p.description}` : ''}`);
  lines.push(`Sent to AMI_Init: ${params}`);
  if (analog) lines.push(`Analog buffer (${analog.type || 'model'}, ${analog.corner}): driver ${analog.rs.toPrecision(3)} ohms, termination ${analog.rt.toPrecision(3)} ohms, C_comp ${(analog.cComp * 1e12).toPrecision(3)} pF, package ${analog.rPkg} ohms ${(analog.lPkg * 1e9).toPrecision(3)} nH ${(analog.cPkg * 1e12).toPrecision(3)} pF, edge ${(analog.rise * 1e12).toPrecision(3)} ps${analog.notes.length ? ` (${analog.notes.join('; ')})` : ''}.`);
  (lab as Lab).host.out(lines.join('\n') + '\n');
  return [];
});
def('ibisModels', (a, nout, lab) => {
  const models = ami.readIbis(fileText(lab as Lab, textOf(a[0] ?? str(''))));
  if (nout > 0) return [record(models.map((m) => [m.name, str(m.executables.map((e) => `${e.platform} ${e.lib} ${e.ami}${e.role ? ` (${e.role})` : ''}`).join('\n'))] as [string, Value]))];
  (lab as Lab).host.out((models.length ? models.map((m) => `${m.name}:\n${m.executables.map((e) => `  ${e.platform}  ${e.lib}  ${e.ami}${e.role ? `  (${e.role})` : ''}`).join('\n')}`).join('\n') : 'No model in this file has an [Algorithmic Model].') + '\n');
  return [];
});
def('amiAvailable', () => [num(hasNative() ? 1 : 0)]);
def('amiSimulate', (a, _n, lab) => {
  const S = sOf(a[0], 'amiSimulate'), rate = need(a[1], 'amiSimulate(S, symbol rate, …)'), w = 'amiSimulate';
  const o = options(a, 2, ['TxModel', 'RxModel', 'Flow', 'Symbols', 'Modulation', 'PRBS', 'Swing', 'SamplesPerUI', 'Seed', 'Crosstalk'], w);
  const tx = modelOf(lab as Lab, o.get('TxModel'), 'TxModel'), rx = modelOf(lab as Lab, o.get('RxModel'), 'RxModel');
  if (!tx && !rx) throw new LabError("amiSimulate needs a 'TxModel' or an 'RxModel' (from amiModel).");
  const spu = Math.round(optNum(o, 'SamplesPerUI', 16)), nsym = Math.round(optNum(o, 'Symbols', 5000)), mod = optText(o, 'Modulation', 'NRZ').toUpperCase(), fl = optText(o, 'Flow', 'timedomain').toLowerCase();
  if (!(spu >= 4 && spu <= 64 && nsym >= 100 && nsym <= 100000) || (mod !== 'NRZ' && mod !== 'PAM4') || (fl !== 'timedomain' && fl !== 'statistical')) throw new LabError(`${w}: 'SamplesPerUI' 4 to 64, 'Symbols' 100 to 100,000, 'Modulation' 'NRZ' or 'PAM4', 'Flow' 'timedomain' or 'statistical'.`);
  const plain = si.impulseResponse(S.f, through(S), rate, spu), dt = plain.dt, ui = 1 / rate, an = analogChannel(S, rate, spu, plain.h, dt, null, tx, rx), h = an.h;
  let x: number[] | null = null, a2: number[] = [];
  if (fl === 'timedomain') {
    a2 = si.symbols(si.prbs(Math.round(optNum(o, 'PRBS', 7)), mod === 'PAM4' ? 2 * nsym : nsym, Math.round(optNum(o, 'Seed', 1))), mod === 'PAM4');
    const sw = optNum(o, 'Swing', 0.8); x = new Array(a2.length * spu);
    for (let k = 0; k < a2.length; k++) for (let j = 0; j < spu; j++) x[k * spu + j] = (a2[k] * sw) / 2;
  }
  const xt = crosstalkOf(o.get('Crosstalk')), paths = pathsOf(S, xt, rate, spu);
  const eLike: si.Eye = { rate, spu, pam4: mod === 'PAM4', order: Math.round(optNum(o, 'PRBS', 7)), nsym, swing: optNum(o, 'Swing', 0.8), ffe: [], ffePre: 0, dfe: 0, rj: 0, dj: 0, noise: 0, ber: 1e-12, xtalk: xt, xtalkPath: paths, seed: Math.round(optNum(o, 'Seed', 1)) };
  const f = ami.flow(h, dt, ui, tx, rx, x, aggressorsOf(h, dt, spu, eLike, fl === 'timedomain', an.near)), t = (n: number) => Array.from({ length: n }, (_, k) => k * dt);
  const aggM = f.aggRx.length ? rows(f.aggRx) : mat(0, 0);
  f.messages.unshift(...an.messages);
  return [record([['Flow', fl], ['dt', dt], ['Impulse', row(f.h)], ['ImpulseTx', row(f.hTx)], ['ImpulseRx', row(f.hRx)], ...(an.rise ? [['ImpulseRise', row(an.rise)], ['ImpulseFall', row(an.fall!)]] as [string, Value][] : []), ['AggressorsRx', aggM], ['t', row(t(f.z ? f.z.length : f.h.length))], ...(f.z ? [['Wave', row(f.z)], ['Stimulus', row(x!)], ['Symbols', row(a2)]] as [string, Value][] : []), ['Clocks', row(f.clocks)], ['UsedGetWave', row(f.usedGetWave.map(Number))], ...bciFields(f), ['Messages', str(f.messages.join('\n'))], ['ParamsOut', str(f.paramsOut.join('\n'))]])];
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
