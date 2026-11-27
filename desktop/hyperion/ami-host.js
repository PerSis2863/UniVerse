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
function session(req) {
  let lib;
  try { lib = koffi.load(req.file); } catch (e) {
    const m = String(e && e.message || e);
    return { ok: false, error: /wrong ELF class|bad CPU type|not a valid Win32|%1 is not|mach-o.*architecture|incompatible architecture/i.test(m) ? `The model is built for another kind of computer (32-bit, or another processor): Hyperion needs its ${process.arch === 'arm64' ? 'ARM 64-bit' : '64-bit'} version. (${m})` : `The model's library could not be loaded: ${m}` };
  }
  let init, getWave = null, close = null;
  try { init = lib.func('long AMI_Init(_Inout_ double *imp, long rows, long agg, double dt, double ui, const char *pin, _Out_ char **pout, _Out_ void **mem, _Out_ char **msg)'); } catch {
    return { ok: false, error: 'This library has no AMI_Init function: it is not an IBIS-AMI model.' };
  }
  try { getWave = lib.func('long AMI_GetWave(_Inout_ double *wave, long n, _Out_ double *clock, _Out_ char **pout, void *mem)'); } catch { /* optional (GetWave_Exists False) */ }
  try { close = lib.func('long AMI_Close(void *mem)'); } catch { /* required by the standard, tolerated if missing */ }

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

function answer(req) { try { return session(req); } catch (e) { return { ok: false, error: `The model failed: ${String(e && e.message || e)}` }; } }

// Electron's utility process talks through parentPort; a Node child (the tests) through process.send.
if (process.parentPort) process.parentPort.once('message', (e) => { process.parentPort.postMessage(answer(e.data)); });
else process.once('message', (req) => { process.send(answer(req), () => process.exit(0)); });

// The tests call one session directly (desktop/hyperion/test, apps/web ami.test.ts).
module.exports = { session: answer };
