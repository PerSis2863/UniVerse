// IBIS-AMI models in Hyperion's computer app (M577): checks a request from Hyperion's engine, puts the model's library
// where it can be loaded (a path on this computer, or the bytes from Hyperion's files written to a private temporary
// folder), and runs one session in ami-host.js in a process of its own, stopped after two minutes. Plain Node apart from
// Electron's utility process, so the tests run it with a Node child instead. Who may call it is decided in main.js.
const { fork, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LIB = /\.(dll|so|dylib)$/i, MAX_LIB = 200e6, MAX_SAMPLES = 4e6, TIME_MS = 120_000;
const bytesOf = (b64) => (typeof b64 === 'string' ? Buffer.byteLength(b64, 'base64') : -1);

/** The model's library as a file and its fingerprint (sha256), or an error. */
function prepare(exe) {
  if (!exe || typeof exe !== 'object' || typeof exe.name !== 'string' || !LIB.test(exe.name)) return { error: 'The model must be a .dll (Windows), .so (Linux) or .dylib (Mac) library.' };
  let bytes;
  if (typeof exe.bytes === 'string') {
    if (bytesOf(exe.bytes) > MAX_LIB) return { error: 'The model library is over 200 MB.' };
    bytes = Buffer.from(exe.bytes, 'base64');
  } else if (typeof exe.path === 'string') {
    if (!path.isAbsolute(exe.path)) return { error: `"${exe.name}" is not in Hyperion's files; give its full path on this computer (for example C:\\models\\${exe.name}).` };
    try { const st = fs.statSync(exe.path); if (!st.isFile() || st.size > MAX_LIB) return { error: `"${exe.path}" is not a model library under 200 MB.` }; bytes = fs.readFileSync(exe.path); } catch { return { error: `"${exe.path}" was not found on this computer.` }; }
  } else return { error: 'No model library was given.' };
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  // A private folder per fingerprint: the same library is written once a visit, and a library loads beside its own
  // name (some models look for their data files next to themselves when given a path: those keep their path).
  if (typeof exe.path === 'string' && typeof exe.bytes !== 'string') return { file: exe.path, sha };
  const dir = path.join(os.tmpdir(), `hyperion-ami-${sha.slice(0, 16)}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, path.basename(exe.name));
  if (!fs.existsSync(file)) fs.writeFileSync(file, bytes, { mode: 0o700 });
  return { file, sha };
}

/** The request's numbers checked: sizes that agree, positive times, a parameter string of text. */
function check(req) {
  if (!req || typeof req !== 'object') return 'Empty request.';
  const rows = req.rows, agg = req.aggressors || 0;
  if (!Number.isInteger(rows) || rows < 2 || rows > MAX_SAMPLES || !Number.isInteger(agg) || agg < 0 || agg > 16) return 'The impulse response has a bad size.';
  if (bytesOf(req.impulse) !== rows * (1 + agg) * 8) return 'The impulse response does not match its size.';
  if (!(req.dt > 0 && req.ui > 0 && req.ui >= req.dt)) return 'The sample interval and the bit time must be above 0.';
  if (typeof req.params !== 'string' || req.params.length > 1e6) return 'The AMI parameters must be text.';
  if (req.wave !== undefined && (bytesOf(req.wave) % 8 || bytesOf(req.wave) / 8 > MAX_SAMPLES)) return 'The waveform has a bad size.';
  return null;
}

/** Starts ami-host.js: Electron's utility process inside the app, a Node child otherwise. */
function host() {
  const file = path.join(__dirname, 'ami-host.js');
  let electron = null;
  try { electron = process.versions.electron ? require('electron') : null; } catch { /* plain Node */ }
  if (electron && electron.utilityProcess) {
    const p = electron.utilityProcess.fork(file, [], { serviceName: 'Hyperion IBIS-AMI model' });
    return { send: (m) => p.postMessage(m), on: (f) => p.once('message', f), exit: (f) => p.once('exit', f), kill: () => p.kill() };
  }
  const p = fork(file, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  return { send: (m) => p.send(m), on: (f) => p.once('message', f), exit: (f) => p.once('exit', f), kill: () => p.kill() };
}

/** Sends one request to a fresh ami-host.js and waits (at most two minutes) for its answer. */
function ask(msg) {
  return new Promise((resolve) => {
    const h = host();
    let done = false;
    const end = (r) => { if (done) return; done = true; clearTimeout(t); resolve(r); };
    const t = setTimeout(() => { h.kill(); end({ ok: false, error: 'The model ran for over 2 minutes and was stopped.' }); }, TIME_MS);
    h.on((r) => end(r));
    h.exit((code) => end({ ok: false, error: `The model crashed (exit code ${code}). It may be built for another system or need files beside it.` }));
    h.send(msg);
  });
}
/** A library's word size from its header (M580): ELF class, the PE machine field, Mach-O's magic; null if unknown. */
function bitsOf(file) {
  let b;
  try { const fd = fs.openSync(file, 'r'); b = Buffer.alloc(4096); fs.readSync(fd, b, 0, 4096, 0); fs.closeSync(fd); } catch { return null; }
  if (b[0] === 0x7f && b.toString('latin1', 1, 4) === 'ELF') return b[4] === 1 ? 32 : b[4] === 2 ? 64 : null;
  if (b.toString('latin1', 0, 2) === 'MZ') {
    const pe = b.readUInt32LE(0x3c);
    if (pe + 6 > b.length || b.toString('latin1', pe, pe + 4) !== 'PE\0\0') return null;
    const m = b.readUInt16LE(pe + 4);
    return m === 0x14c ? 32 : m === 0x8664 || m === 0xaa64 ? 64 : null;
  }
  const magic = b.readUInt32LE(0);
  return magic === 0xfeedface || magic === 0xcefaedfe ? 32 : magic === 0xfeedfacf || magic === 0xcffaedfe ? 64 : null;
}
/** The 32-bit helper for this system (built by host32/build.sh; inside the installed app, unpacked beside app.asar). */
function helper32() {
  const name = process.platform === 'win32' ? 'ami-host32-win32.exe' : process.platform === 'linux' ? 'ami-host32-linux' : null;
  if (!name) return null;
  const file = path.join(__dirname.replace(/app\.asar(?=[\\/]|$)/, 'app.asar.unpacked'), 'bin', name);
  return fs.existsSync(file) ? file : null;
}
const text = (s) => { const b = Buffer.from(String(s), 'utf8'); const n = Buffer.alloc(4); n.writeUInt32LE(b.length); return [n, b]; };
/** One session in the 32-bit helper: the request as bytes on its input, the answer read back from its output. */
/** The 32-bit helper ready to run here, or why not. */
function need32() {
  const exe = helper32();
  if (!exe) return { error: process.platform === 'darwin' ? 'This model is 32-bit: Macs have not run 32-bit programs since macOS 10.15. Ask its maker for a 64-bit version.' : "This model is 32-bit and this copy of Hyperion has no 32-bit helper. Install the newest Hyperion, or ask the model's maker for a 64-bit version." };
  if (process.platform === 'linux' && !fs.existsSync('/lib/ld-linux.so.2') && !fs.existsSync('/usr/lib32') && !fs.existsSync('/lib32')) return { error: 'This model is 32-bit: running it on Linux needs the 32-bit system libraries ("sudo apt install libc6-i386" on Debian and Ubuntu).' };
  return { exe };
}
function run32(req, prepared) {
  const { exe, error } = need32();
  if (error) return Promise.resolve({ ok: false, error });
  const head = Buffer.alloc(4 + 4 + 8 + 8);
  head.write('AMI1', 0, 'latin1'); head.writeInt32LE(req.rows, 4); head.writeInt32LE(req.aggressors || 0, 8);
  const nums = Buffer.alloc(16); nums.writeDoubleLE(req.dt, 0); nums.writeDoubleLE(req.ui, 8);
  const wave = req.wave ? Buffer.from(req.wave, 'base64') : Buffer.alloc(0), wl = Buffer.alloc(4), bl = Buffer.alloc(4);
  wl.writeUInt32LE(wave.length / 8); bl.writeUInt32LE(req.block || 0);
  const input = Buffer.concat([head.subarray(0, 4), ...text(prepared.file), ...text(req.params), head.subarray(4, 12), nums, Buffer.from(req.impulse, 'base64'), wl, wave, bl]);
  return new Promise((resolve) => {
    const p = spawn(exe, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }), parts = [];
    let done = false;
    const end = (r) => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
    const t = setTimeout(() => { p.kill(); end({ ok: false, error: 'The model ran for over 2 minutes and was stopped.' }); }, TIME_MS);
    p.stdout.on('data', (d) => parts.push(d));
    p.on('error', (e) => end({ ok: false, error: `The 32-bit helper could not start: ${e.message}` }));
    p.on('close', (code) => {
      const b = Buffer.concat(parts);
      if (b.length < 8 || b.toString('latin1', 0, 4) !== 'AMR1') return end({ ok: false, error: `The 32-bit model crashed (exit code ${code}). It may need files beside it.` });
      let at = 4;
      const i32 = () => { const v = b.readInt32LE(at); at += 4; return v; }, u32 = () => { const v = b.readUInt32LE(at); at += 4; return v; };
      const str = () => { const n = u32(); const s = b.toString('utf8', at, at + n); at += n; return s; };
      const f64s = () => { const n = u32(); const s = b.subarray(at, at + n * 8).toString('base64'); at += n * 8; return s; };
      const status = i32(), error = str(), initReturn = i32(), paramsOut = str(), message = str(), hasGetWave = !!i32(), impulse = f64s(), wv = f64s(), clocks = f64s(), waveParams = str();
      end({ ok: status === 0, ...(error ? { error } : {}), initReturn, paramsOut, message, hasGetWave, impulse, ...(req.wave && hasGetWave ? { wave: wv, clocks, waveParams } : {}), bits: 32 });
    });
    p.stdin.on('error', () => { /* the helper ended early: its answer says why */ });
    p.stdin.end(input);
  });
}

/** Runs one model session; resolves with ami-host.js's answer (or the 32-bit helper's), or { ok: false, error }. */
function run(req, prepared) {
  const bad = check(req);
  if (bad) return Promise.resolve({ ok: false, error: bad });
  if (bitsOf(prepared.file) === 32) return run32(req, prepared);
  return ask({ file: prepared.file, params: req.params, impulse: req.impulse, rows: req.rows, aggressors: req.aggressors || 0, dt: req.dt, ui: req.ui, wave: req.wave, block: req.block });
}
/** A back-channel link (M579): the models run in turns in a private shared folder removed afterwards; a 32-bit one
 * through the 32-bit helper (M581); each neighbouring line in `aggs` a trained link of its own (M582), `inner` the lane just inside it on the same side (M588), `across` the first lane on the victim's other side and `share` its coupling (M589). */
async function link(req, tx, rx) {
  const bad = check({ ...req, aggressors: 0, params: req.tx && req.tx.params });
  if (bad) return { ok: false, error: bad };
  if (typeof req.rx?.params !== 'string' || typeof req.wave !== 'string') return { ok: false, error: 'The link request is incomplete.' };
  const aggs = req.aggs === undefined ? [] : req.aggs;
  if (!Array.isArray(aggs) || aggs.length > 16 || aggs.some((g) => !g || bytesOf(g.wave) !== bytesOf(req.wave) || bytesOf(g.h) !== req.rows * 8)) return { ok: false, error: 'The neighbouring lines in the link request have bad sizes.' };
  const interval = Math.round(req.interval), training = Math.round(req.training);
  if (!(interval >= 1 && interval <= 1e6 && training >= 0 && training <= 1e7)) return { ok: false, error: 'BCI_Message_Interval_UI and BCI_Training_UI must be whole numbers of UI.' };
  const side = (p, params) => {
    if (bitsOf(p.file) !== 32) return { file: p.file, params };
    const h = need32();
    return h.error ? h : { file: p.file, params, helper: h.exe };
  };
  const t = side(tx, req.tx.params), r = side(rx, req.rx.params);
  if (t.error || r.error) return { ok: false, error: t.error || r.error };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperion-bci-'));
  try {
    return await ask({ op: 'link', tx: t, rx: r, impulse: req.impulse, rows: req.rows, dt: req.dt, ui: req.ui, wave: req.wave, aggs: aggs.map((g) => ({ wave: g.wave, h: g.h, ...(g.inner === undefined ? {} : { inner: Number(g.inner) }), ...(g.across === undefined ? {} : { across: Number(g.across), share: Number(g.share) || 0 }) })), interval, training, dir });
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* the system cleans its temporary folder */ } }
}

module.exports = { prepare, check, run, link, bitsOf };
