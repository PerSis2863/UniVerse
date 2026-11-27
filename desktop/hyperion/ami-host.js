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
/**
 * A link with a back-channel (IBIS 6.1, BCI): both models loaded in this process, run in a shared folder (they talk
 * through files named with the BCI_ID the tool gives both), and AMI_GetWave called in turns: a block from the
 * transmitter, through the channel (plus any crosstalk already at the pins), into the receiver; blocks of
 * BCI_Message_Interval_UI while training (BCI_Training_UI), then of 128 UI. req: { tx, rx: { file, params }, impulse,
 * rows, dt, ui, wave, extra, interval, training, dir }.
 */
function link(req) {
  const T = open(req.tx.file); if (T.error) return { ok: false, error: `Transmitter: ${T.error}` };
  const R = open(req.rx.file); if (R.error) return { ok: false, error: `Receiver: ${R.error}` };
  if (!T.getWave || !R.getWave) return { ok: false, error: 'A back-channel link needs AMI_GetWave in both models.' };
  try { process.chdir(req.dir); } catch { return { ok: false, error: 'The shared folder for the models could not be opened.' }; }
  const h = f64(req.impulse), init = (L, p, who) => {
    const imp = Float64Array.from(h), pout = [null], mem = [null], msg = [null];
    const r = L.init(imp, req.rows, 0, req.dt, req.ui, p, pout, mem, msg);
    return r === 0 ? { error: `${who}'s AMI_Init refused${msg[0] ? `: ${msg[0]}` : ''}.` } : { mem: mem[0], params: pout[0] || '', message: msg[0] || '' };
  };
  const ti = init(T, req.tx.params, 'The transmitter'); if (ti.error) return { ok: false, error: ti.error };
  const ri = init(R, req.rx.params, 'The receiver'); if (ri.error) { if (T.close) T.close(ti.mem); return { ok: false, error: ri.error }; }
  const x = f64(req.wave), extra = req.extra ? f64(req.extra) : null, n = x.length, spu = Math.round(req.ui / req.dt);
  const small = Math.max(1, req.interval * spu), big = Math.max(small, 128 * spu), trainEnd = Math.min(n, req.training * spu);
  const out = new Float64Array(n), clocks = [], history = [];
  const chan = channel(h, req.dt, Math.max(small, big));
  let error = '';
  for (let at = 0; at < n;) {
    const len = Math.min(at < trainEnd ? small : big, n - at), part = Float64Array.from(x.subarray(at, at + len));
    const tc = new Float64Array(len + 1).fill(-1), tp = [null];
    if (T.getWave(part, len, tc, tp, ti.mem) === 0) { error = `The transmitter's AMI_GetWave refused at sample ${at}.`; break; }
    const pins = chan(part);
    if (extra) for (let k = 0; k < len; k++) pins[k] += extra[at + k] || 0;
    const rc = new Float64Array(len + 1).fill(-1), rp = [null];
    if (R.getWave(pins, len, rc, rp, ri.mem) === 0) { error = `The receiver's AMI_GetWave refused at sample ${at}.`; break; }
    out.set(pins, at);
    for (let k = 0; k < rc.length && rc[k] >= 0; k++) clocks.push(rc[k]);
    history.push({ ui: at / spu, tx: tp[0] || '', rx: rp[0] || '' });
    at += len;
  }
  if (T.close) T.close(ti.mem); if (R.close) R.close(ri.mem);
  let files = [];
  try { files = require('node:fs').readdirSync(req.dir); } catch { /* none */ }
  return { ok: !error, error: error || undefined, wave: b64(out), clocks: b64(Float64Array.from(clocks)), history, files, paramsOut: [ti.params, ri.params], messages: [ti.message, ri.message] };
}

function answer(req) { try { return req && req.op === 'link' ? link(req) : session(req); } catch (e) { return { ok: false, error: `The model failed: ${String(e && e.message || e)}` }; } }

// Electron's utility process talks through parentPort; a Node child (the tests) through process.send.
if (process.parentPort) process.parentPort.once('message', (e) => { process.parentPort.postMessage(answer(e.data)); });
else process.once('message', (req) => { process.send(answer(req), () => process.exit(0)); });

// The tests call one session directly (desktop/hyperion/test, apps/web ami.test.ts).
module.exports = { session: answer, link: answer };
