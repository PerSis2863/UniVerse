// IBIS-AMI models in Hyperion's computer app (M577): checks a request from Hyperion's engine, puts the model's library
// where it can be loaded (a path on this computer, or the bytes from Hyperion's files written to a private temporary
// folder), and runs one session in ami-host.js in a process of its own, stopped after two minutes. Plain Node apart from
// Electron's utility process, so the tests run it with a Node child instead. Who may call it is decided in main.js.
const { fork } = require('node:child_process');
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
/** Runs one model session; resolves with ami-host.js's answer, or { ok: false, error }. */
function run(req, prepared) {
  const bad = check(req);
  if (bad) return Promise.resolve({ ok: false, error: bad });
  return ask({ file: prepared.file, params: req.params, impulse: req.impulse, rows: req.rows, aggressors: req.aggressors || 0, dt: req.dt, ui: req.ui, wave: req.wave, block: req.block });
}
/** A back-channel link (M579): both models in one process, in a private shared folder removed afterwards. */
async function link(req, tx, rx) {
  const bad = check({ ...req, aggressors: 0, params: req.tx && req.tx.params });
  if (bad) return { ok: false, error: bad };
  if (typeof req.rx?.params !== 'string' || typeof req.wave !== 'string' || (req.extra !== undefined && bytesOf(req.extra) !== bytesOf(req.wave))) return { ok: false, error: 'The link request is incomplete.' };
  const interval = Math.round(req.interval), training = Math.round(req.training);
  if (!(interval >= 1 && interval <= 1e6 && training >= 0 && training <= 1e7)) return { ok: false, error: 'BCI_Message_Interval_UI and BCI_Training_UI must be whole numbers of UI.' };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperion-bci-'));
  try {
    return await ask({ op: 'link', tx: { file: tx.file, params: req.tx.params }, rx: { file: rx.file, params: req.rx.params }, impulse: req.impulse, rows: req.rows, dt: req.dt, ui: req.ui, wave: req.wave, extra: req.extra, interval, training, dir });
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* the system cleans its temporary folder */ } }
}

module.exports = { prepare, check, run, link };
