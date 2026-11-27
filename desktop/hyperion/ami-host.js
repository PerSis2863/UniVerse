// Hyperion's computer app runs IBIS-AMI models (M577, the owner, 27 Nov: "make [IBIS-AMI] for the Hyperion download
// app which can do it"). A chip maker's AMI model is a compiled library (.dll, .so, .dylib) with three C functions
// (IBIS 7.2, section 10): AMI_Init (equalises the channel's impulse response, statistical flow), AMI_GetWave (filters a
// waveform block by block, time-domain flow; optional) and AMI_Close. This file runs in a process of its own (Electron's
// utility process, or a Node child in the tests), so a model that crashes or hangs never takes the app down: it loads
// the library with koffi (a foreign-function library: no compiler needed), runs one session and answers once.

const koffi = require('koffi');

const f64 = (b64) => { const b = Buffer.from(b64, 'base64'); return new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');

/**
 * One model session. req: { file, params, impulse (base64 doubles, rows × (1 + aggressors), column-major), rows,
 * aggressors, dt, ui, wave (base64 doubles, optional), block (samples per AMI_GetWave call) }.
 */
/** Loads a model's library and its three functions, or says why not. */
function open(file) {
  let lib;
  try { lib = koffi.load(file); } catch (e) {
    const m = String(e && e.message || e);
    return { error: /wrong ELF class|bad CPU type|not a valid Win32|%1 is not|mach-o.*architecture|incompatible architecture/i.test(m) ? `The model is built for another kind of computer (32-bit, or another processor): Hyperion needs its ${process.arch === 'arm64' ? 'ARM 64-bit' : '64-bit'} version. (${m})` : `The model's library could not be loaded: ${m}` };
  }
  let init, getWave = null, close = null;
  try { init = lib.func('long AMI_Init(_Inout_ double *imp, long rows, long agg, double dt, double ui, const char *pin, _Out_ char **pout, _Out_ void **mem, _Out_ char **msg)'); } catch {
    return { error: 'This library has no AMI_Init function: it is not an IBIS-AMI model.' };
  }
  try { getWave = lib.func('long AMI_GetWave(_Inout_ double *wave, long n, _Out_ double *clock, _Out_ char **pout, void *mem)'); } catch { /* optional (GetWave_Exists False) */ }
  try { close = lib.func('long AMI_Close(void *mem)'); } catch { /* required by the standard, tolerated if missing */ }
  return { init, getWave, close };
}

/**
 * One model session. req: { file, params, impulse (base64 doubles, rows × (1 + aggressors), column-major), rows,
 * aggressors, dt, ui, wave (base64 doubles, optional), block (samples per AMI_GetWave call) }.
 */
function session(req) {
  const L = open(req.file);
  if (L.error) return { ok: false, error: L.error };
  const { init, getWave, close } = L;
  const imp = f64(req.impulse), pout = [null], mem = [null], msg = [null];
  const t0 = Date.now();
  const ret = init(imp, req.rows, req.aggressors || 0, req.dt, req.ui, req.params || '', pout, mem, msg);
  const out = { ok: ret !== 0, initReturn: Number(ret), paramsOut: pout[0] || '', message: msg[0] || '', impulse: b64(imp), hasGetWave: !!getWave, initMs: Date.now() - t0 };
  if (ret === 0) { out.error = `The model's AMI_Init refused${msg[0] ? `: ${msg[0]}` : ''}.`; if (close && mem[0]) close(mem[0]); return out; }
  if (req.wave && getWave) {
    const wave = f64(req.wave), n = wave.length, block = Math.max(1, Math.min(n, req.block || n)), clocks = [], params = [];
    for (let at = 0; at < n; at += block) {
      const len = Math.min(block, n - at), part = wave.subarray(at, at + len), clk = new Float64Array(len + 1).fill(-1), po = [null];
      const r = getWave(part, len, clk, po, mem[0]);
      if (r === 0) { out.ok = false; out.error = `The model's AMI_GetWave refused at sample ${at}.`; break; }
      for (let k = 0; k < clk.length && clk[k] >= 0; k++) clocks.push(clk[k]);
      if (po[0]) params.push(po[0]);
    }
    out.wave = b64(wave); out.clocks = b64(Float64Array.from(clocks)); out.waveParams = params.slice(-1)[0] || '';
  }
  if (close && mem[0]) close(mem[0]);
  out.ms = Date.now() - t0;
  return out;
}

/** Radix-2 FFT in place (n a power of two); inverse scales by 1/n. */
function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = ((inverse ? 2 : -2) * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
/** The channel applied block by block (overlap-add): each block's convolution with h × dt, its tail carried on. */
function channel(h, dt, block) {
  let N = 1; while (N < h.length + block) N <<= 1;
  const Hr = new Float64Array(N), Hi = new Float64Array(N);
  h.forEach((v, i) => { Hr[i] = v * dt; });
  fft(Hr, Hi, false);
  let tail = new Float64Array(0);
  return (x) => {
    const re = new Float64Array(N), im = new Float64Array(N);
    re.set(x);
    fft(re, im, false);
    for (let k = 0; k < N; k++) { const r = re[k] * Hr[k] - im[k] * Hi[k], i = re[k] * Hi[k] + im[k] * Hr[k]; re[k] = r; im[k] = i; }
    fft(re, im, true);
    const out = re.subarray(0, x.length + h.length - 1);
    for (let k = 0; k < tail.length; k++) out[k] += tail[k];
    tail = Float64Array.from(out.subarray(x.length));
    return Float64Array.from(out.subarray(0, x.length));
  };
}
/** A 64-bit model loaded here, as one end of a link: init, a block through GetWave, close; each call made in the
 * model's own folder (its line's, M584), where it reads and writes its back-channel files. */
function local(file, dir) {
  const L = open(file);
  if (L.error) return L;
  let mem = null;
  return {
    getWave: !!L.getWave,
    init(imp, rows, dt, ui, params) {
      process.chdir(dir);
      const pout = [null], m = [null], msg = [null], r = L.init(imp, rows, 0, dt, ui, params, pout, m, msg);
      mem = m[0];
      return { ret: Number(r), params: pout[0] || '', message: msg[0] || '' };
    },
    wave(part) {
      process.chdir(dir);
      const clk = new Float64Array(part.length + 1).fill(-1), po = [null], r = L.getWave(part, part.length, clk, po, mem), clocks = [];
      for (let k = 0; k < clk.length && clk[k] >= 0; k++) clocks.push(clk[k]);
      return { ok: r !== 0, wave: part, clocks, params: po[0] || '' };
    },
    async close() { process.chdir(dir); if (L.close && mem) L.close(mem); mem = null; },
  };
}
/** A 32-bit model as one end of a link (M581): the 32-bit helper in its stepping mode, run in the shared folder;
 * each call a request on its input and the answer read back from its output. */
function remote(file, exe, dir) {
  const { spawn } = require('node:child_process');
  const p = spawn(exe, [], { cwd: dir, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  let buf = Buffer.alloc(0), wait = null, dead = '', ended = null;
  const exited = new Promise((r) => { ended = r; });
  const pump = () => {
    if (!wait) return;
    if (buf.length >= wait.n) { const w = wait, out = buf.subarray(0, w.n); wait = null; buf = buf.subarray(w.n); w.ok(out); }
    else if (dead) { const w = wait; wait = null; w.no(new Error(dead)); }
  };
  p.stdout.on('data', (d) => { buf = Buffer.concat([buf, d]); pump(); });
  p.on('close', (code) => { dead = `The 32-bit model crashed (exit code ${code}).`; ended(); pump(); });
  p.on('error', (e) => { dead = `The 32-bit helper could not start: ${e.message}`; ended(); pump(); });
  p.stdin.on('error', () => { /* the helper ended: the next read says why */ });
  const take = (n) => new Promise((ok, no) => { wait = { n, ok, no }; pump(); });
  const i32 = async () => (await take(4)).readInt32LE(0), u32 = async () => (await take(4)).readUInt32LE(0);
  const str = async () => (await take(await u32())).toString('utf8');
  const nums = async () => { const b = await take((await u32()) * 8); return new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
  const text = (s) => { const b = Buffer.from(String(s), 'utf8'), n = Buffer.alloc(4); n.writeUInt32LE(b.length); return [n, b]; };
  let getWave = false;
  return {
    get getWave() { return getWave; },
    async init(imp, rows, dt, ui, params) {
      const h = Buffer.alloc(24); h.writeInt32LE(rows, 0); h.writeInt32LE(0, 4); h.writeDoubleLE(dt, 8); h.writeDoubleLE(ui, 16);
      p.stdin.write(Buffer.concat([Buffer.from('AMS1', 'latin1'), ...text(file), ...text(params), h, Buffer.from(imp.buffer, imp.byteOffset, imp.byteLength)]));
      if ((await take(4)).toString('latin1') !== 'AMR2') throw new Error('The 32-bit helper answered in a way Hyperion does not know.');
      const status = await i32(), error = await str(), ret = await i32(), params2 = await str(), message = await str();
      getWave = !!(await i32()); await nums();
      if (status && !ret && error && !/AMI_Init refused/.test(error)) throw new Error(error);
      return { ret, params: params2, message };
    },
    async wave(part) {
      const n = Buffer.alloc(5); n.write('W', 0, 'latin1'); n.writeUInt32LE(part.length, 1);
      p.stdin.write(Buffer.concat([n, Buffer.from(part.buffer, part.byteOffset, part.byteLength)]));
      const status = await i32(), wave = await nums(), clocks = Array.from(await nums()), params = await str();
      return { ok: status === 0, wave, clocks, params };
    },
    async close() { p.stdin.end('C'); await exited; },
  };
}
/**
 * A link with a back-channel (IBIS 6.1, BCI): both models run in a shared folder (they talk through files named with
 * the BCI_ID the tool gives both), and AMI_GetWave is called in turns: a block from the transmitter, through the
 * channel, into the receiver; blocks of BCI_Message_Interval_UI while training (BCI_Training_UI), then of 128 UI.
 * 64-bit models load here, 32-bit ones in the 32-bit helper (M581: each end its own; `helper` on a side says which).
 * Each neighbouring line (M582) is a link of its own, its transmitter trained by its own receiver over the same
 * channel, in a folder of its own (a1, a2 …: their files never meet, whatever the model calls them). Every block, all
 * the transmitters run first; then the victim's receiver hears its line plus each neighbour through its coupling, and
 * each neighbour's receiver its own line plus the victim through the same coupling (taken as reciprocal). A neighbour
 * further out on the same side (M588: `inner`, the lane just inside it, 1-based) and that lane hear each other too,
 * through the inner lane's own coupling (the lines equally spaced); lines on opposite sides, the victim between them,
 * are not coupled.
 * req: { tx, rx: { file, params, helper? }, impulse, rows, dt, ui, wave, aggs: [{ wave, h, inner? }], interval, training, dir }.
 */
async function link(req) {
  const fs = require('node:fs'), path = require('node:path');
  const ends = [], make = (side, who, dir) => {
    const e = side.helper ? remote(side.file, side.helper, dir) : local(side.file, dir);
    if (e.error) throw new Error(`${who}: ${e.error}`);
    ends.push(e);
    return e;
  };
  const h = f64(req.impulse), x0 = f64(req.wave), n = x0.length, spu = Math.round(req.ui / req.dt);
  const small = Math.max(1, req.interval * spu), big = Math.max(small, 128 * spu), trainEnd = Math.min(n, req.training * spu), most = Math.max(small, big);
  const aggs = req.aggs || [], lanes = [];
  let error = '';
  try {
    for (let j = 0; j <= aggs.length; j++) {
      const dir = j ? path.join(req.dir, `a${j}`) : req.dir;
      try { fs.mkdirSync(dir, { recursive: true }); process.chdir(dir); } catch { throw new Error('The shared folder for the models could not be opened.'); }
      const name = j ? ` of neighbouring line ${j}` : '', T = make(req.tx, `Transmitter${name}`, dir), R = make(req.rx, `Receiver${name}`, dir);
      const ti = await T.init(Float64Array.from(h), req.rows, req.dt, req.ui, req.tx.params);
      if (!ti.ret) throw new Error(`The transmitter${name}'s AMI_Init refused${ti.message ? `: ${ti.message}` : ''}.`);
      const ri = await R.init(Float64Array.from(h), req.rows, req.dt, req.ui, req.rx.params);
      if (!ri.ret) throw new Error(`The receiver${name}'s AMI_Init refused${ri.message ? `: ${ri.message}` : ''}.`);
      if (!T.getWave || !R.getWave) throw new Error('A back-channel link needs AMI_GetWave in both models.');
      const hj = j ? f64(aggs[j - 1].h) : null;
      lanes.push({ T, R, ti, ri, x: j ? f64(aggs[j - 1].wave) : x0, chan: channel(h, req.dt, most), into: hj && channel(hj, req.dt, most), from: hj && channel(hj, req.dt, most), tx: ti.params, rx: ri.params });
    }
    // neighbours side by side (M588): each pair its own two overlap-add channels, one each way
    const pairs = [];
    aggs.forEach((g, i) => {
      if (g.inner === undefined) return;
      const k = g.inner, j = i + 1;
      if (!Number.isInteger(k) || k < 1 || k > aggs.length || k === j) throw new Error(`Neighbouring line ${j}: the line inside it is 1 to ${aggs.length}, not itself.`);
      const hk = f64(aggs[k - 1].h);
      pairs.push({ j, k, toJ: channel(hk, req.dt, most), toK: channel(hk, req.dt, most) });
    });
    const out = new Float64Array(n), clocks = [], history = [];
    for (let at = 0; at < n && !error;) {
      const len = Math.min(at < trainEnd ? small : big, n - at), sent = [];
      for (const [j, L] of lanes.entries()) {
        const t = await L.T.wave(Float64Array.from(L.x.subarray(at, at + len)));
        if (!t.ok) { error = `${j ? `Neighbouring line ${j}'s` : 'The'} transmitter's AMI_GetWave refused at sample ${at}.`; break; }
        sent.push(t);
      }
      if (error) break;
      const pins = lanes.map((L, j) => L.chan(sent[j].wave));
      lanes.forEach((L, j) => {
        if (!j) return;
        const c = L.into(sent[j].wave), back = L.from(sent[0].wave);
        for (let k = 0; k < len; k++) { pins[0][k] += c[k]; pins[j][k] += back[k]; }
      });
      for (const P of pairs) {
        const a = P.toJ(sent[P.k].wave), b = P.toK(sent[P.j].wave);
        for (let k = 0; k < len; k++) { pins[P.j][k] += a[k]; pins[P.k][k] += b[k]; }
      }
      for (const [j, L] of lanes.entries()) {
        const r = await L.R.wave(pins[j]);
        if (!r.ok) { error = `${j ? `Neighbouring line ${j}'s` : 'The'} receiver's AMI_GetWave refused at sample ${at}.`; break; }
        if (j) { L.tx = sent[j].params || L.tx; L.rx = r.params || L.rx; continue; }
        out.set(r.wave, at);
        for (const c of r.clocks) clocks.push(c);
        history.push({ ui: at / spu, tx: sent[0].params, rx: r.params });
      }
      at += len;
    }
    for (const e of ends.splice(0)) await e.close();
    let files = [];
    try { files = fs.readdirSync(req.dir, { recursive: true }).map((f) => String(f).split(path.sep).join('/')).filter((f) => !/^a\d+$/.test(f)).sort(); } catch { /* none */ }
    return { ok: !error, error: error || undefined, wave: b64(out), clocks: b64(Float64Array.from(clocks)), history, files, paramsOut: [lanes[0].ti.params, lanes[0].ri.params], messages: [lanes[0].ti.message, lanes[0].ri.message], lanes: lanes.slice(1).map((L) => ({ tx: L.tx, rx: L.rx })) };
  } catch (e) {
    for (const end of ends) { try { await end.close(); } catch { /* already gone */ } }
    return { ok: false, error: String(e && e.message || e) };
  }
}

/** One request answered (a promise: a link may wait on the 32-bit helper). */
async function answer(req) { try { return req && req.op === 'link' ? await link(req) : session(req); } catch (e) { return { ok: false, error: `The model failed: ${String(e && e.message || e)}` }; } }

// Electron's utility process talks through parentPort; a Node child (the tests) through process.send.
if (process.parentPort) process.parentPort.once('message', async (e) => { process.parentPort.postMessage(await answer(e.data)); });
else process.once('message', async (req) => { const r = await answer(req); process.send(r, () => process.exit(0)); });

// The tests call these directly (desktop/hyperion/test, apps/web ami.test.ts); both return promises.
module.exports = { session: answer, link: answer };
