// Tests for the computer app's IBIS-AMI runner (M577), with plain Node: node --test test/
// Builds the tiny test model with the system's C compiler (skipped where there is none).
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ami = require('../ami');

const ext = process.platform === 'win32' ? '.dll' : process.platform === 'darwin' ? '.dylib' : '.so';
const lib = path.join(os.tmpdir(), `hyperion-ami-test${ext}`);
let built = true;
try { execFileSync('gcc', ['-shared', '-fPIC', '-O2', path.join(__dirname, 'ami-test-model.c'), '-o', lib]); } catch { built = false; }
const b64 = (a) => Buffer.from(Float64Array.from(a).buffer).toString('base64');
const f64 = (s) => { const b = Buffer.from(s, 'base64'); return Array.from(new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))); };

test('the request is checked before anything loads', async () => {
  assert.match(ami.prepare({ name: 'x.exe', bytes: '' }).error, /\.dll/);
  assert.match(ami.prepare({ name: 'rx.dll', path: 'rx.dll' }).error, /full path/);
  assert.match((await ami.run({ rows: 4, impulse: b64([1, 2, 3]), dt: 1, ui: 1, params: '' }, { file: lib })).error, /match/);
  assert.match((await ami.run({ rows: 4, impulse: b64([1, 2, 3, 4]), dt: 0, ui: 1, params: '' }, { file: lib })).error, /above 0/);
});

test('a model equalises the impulse (Init) and filters the waveform in blocks (GetWave)', { skip: !built && 'no C compiler' }, async () => {
  const p = ami.prepare({ name: path.basename(lib), bytes: fs.readFileSync(lib).toString('base64') });
  assert.ok(p.file && /^[0-9a-f]{64}$/.test(p.sha));
  const imp = new Array(64).fill(0); imp[3] = 1;
  const wave = new Array(80).fill(1);
  const r = await ami.run({ rows: 64, impulse: b64(imp), dt: 1e-12, ui: 8e-12, params: '(test_tx (tap -0.25))', wave: b64(wave), block: 24 }, p);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.message, 'Hyperion test model ready');
  const h = f64(r.impulse);
  assert.ok(Math.abs(h[3] - 0.5) < 1e-12 && Math.abs(h[11] + 1 / 6) < 1e-12);
  const w = f64(r.wave);
  // 0.5 for the first UI, then 1/3 (main + post), the same across the blocks of 24
  assert.ok(w.slice(0, 8).every((v) => Math.abs(v - 0.5) < 1e-12));
  assert.ok(w.slice(8).every((v) => Math.abs(v - 1 / 3) < 1e-12));
  assert.equal(f64(r.clocks).length, 10);
  assert.match(r.paramsOut, /tap -0.25/);
});

test('a library that is not an AMI model, and one that does not load, are refused with a reason', async () => {
  const notAmi = process.platform === 'linux' ? '/lib/x86_64-linux-gnu/libm.so.6' : null;
  if (notAmi && fs.existsSync(notAmi)) assert.match((await ami.run({ rows: 2, impulse: b64([1, 0]), dt: 1, ui: 1, params: '' }, { file: notAmi })).error, /no AMI_Init/);
  const junk = path.join(os.tmpdir(), `hyperion-junk${ext}`); fs.writeFileSync(junk, 'not a library');
  assert.match((await ami.run({ rows: 2, impulse: b64([1, 0]), dt: 1, ui: 1, params: '' }, { file: junk })).error, /could not be loaded|another kind of computer/);
});

test('a back-channel link: the receiver tells the transmitter its tap through their shared folder (M579)', { skip: !built && 'no C compiler' }, async () => {
  const bci = path.join(os.tmpdir(), `hyperion-bci-test${ext}`);
  execFileSync('gcc', ['-shared', '-fPIC', '-O2', path.join(__dirname, 'ami-test-bci.c'), '-o', bci]);
  const p = ami.prepare({ name: path.basename(bci), path: bci });
  const imp = new Array(64).fill(0); imp[0] = 1e12;               // a lossless channel: 1 V/s × dt = 1
  const n = 8 * 400, wave = Array.from({ length: n }, (_, i) => (Math.floor(i / 8) % 2 ? 0.4 : -0.4));
  const r = await ami.link({ tx: { params: '(test_bci (role tx) (tap -0.1) (BCI_ID "link1"))' }, rx: { params: '(test_bci (role rx) (BCI_ID "link1"))' }, impulse: b64(imp), rows: 64, dt: 1e-12, ui: 8e-12, wave: b64(wave), interval: 32, training: 200 }, p, p);
  assert.equal(r.ok, true, r.error);
  // training in blocks of 32 UI, then 128: the transmitter reads the receiver's request after the second block
  assert.deepEqual(r.history.slice(0, 4).map((x) => x.ui), [0, 32, 64, 96]);
  assert.match(r.history[0].tx, /tap -0.1\)/);
  assert.match(r.history[2].tx, /tap -0.35\)/);
  assert.deepEqual(r.files, ['link1.rx2tx']);
  assert.equal(f64(r.clocks).length, 400);
  assert.equal(f64(r.wave).length, n);
});

test('neighbouring lines train their own transmitters, each by its own receiver (M582)', { skip: !built && 'no C compiler' }, async () => {
  const bci = path.join(os.tmpdir(), `hyperion-bci-test${ext}`);
  execFileSync('gcc', ['-shared', '-fPIC', '-O2', path.join(__dirname, 'ami-test-bci.c'), '-o', bci]);
  const p = ami.prepare({ name: path.basename(bci), path: bci });
  const imp = new Array(64).fill(0); imp[0] = 1e12;
  const n = 8 * 400, wave = Array.from({ length: n }, (_, i) => (Math.floor(i / 8) % 2 ? 0.4 : -0.4));
  const couple = new Array(64).fill(0); couple[0] = 1e11;          // a tenth of the neighbour's signal reaches the pins
  const agg = Array.from({ length: n }, (_, i) => (Math.floor(i / 16) % 2 ? 0.4 : -0.4));
  const req = { tx: { params: '(test_bci (role tx) (tap -0.1) (BCI_ID "link1"))' }, rx: { params: '(test_bci (role rx) (BCI_ID "link1"))' }, impulse: b64(imp), rows: 64, dt: 1e-12, ui: 8e-12, wave: b64(wave), interval: 32, training: 200 };
  const r = await ami.link({ ...req, aggs: [{ wave: b64(agg), h: b64(couple) }] }, p, p);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.files, ['link1.rx2tx', 'link1_a1.rx2tx']);
  assert.match(r.lanes[0].tx, /tap -0.35\)/);
  const quiet = await ami.link(req, p, p), d = f64(r.wave).map((v, i) => v - f64(quiet.wave)[i]);
  assert.ok(Math.max(...d.map(Math.abs)) > 0.01 && Math.max(...d.map(Math.abs)) < 0.05);   // the neighbour's 0.4 V, a tenth, through its FFE
  assert.match((await ami.link({ ...req, aggs: [{ wave: b64([1]), h: b64(couple) }] }, p, p)).error, /bad sizes/);
});

test('a 32-bit model runs through the 32-bit helper (M580)', { skip: (!fs.existsSync(path.join(__dirname, '..', 'bin', 'ami-host32-linux')) || process.platform !== 'linux') && 'no 32-bit helper here' }, async () => {
  const lib32 = path.join(os.tmpdir(), 'hyperion-ami-test32.so');
  try { execFileSync('gcc', ['-m32', '-shared', '-fPIC', '-O2', path.join(__dirname, 'ami-test-model.c'), '-o', lib32]); } catch { return; }
  assert.equal(ami.bitsOf(lib32), 32);
  const imp = new Array(64).fill(0); imp[3] = 1;
  const r = await ami.run({ rows: 64, aggressors: 0, impulse: b64(imp), dt: 1e-12, ui: 8e-12, params: '(test_tx (tap -0.25))', wave: b64(new Array(80).fill(1)), block: 24 }, { file: lib32 });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.bits, 32);
  assert.equal(r.message, 'Hyperion test model ready');
  const h = f64(r.impulse), w = f64(r.wave);
  assert.ok(Math.abs(h[3] - 0.5) < 1e-12 && Math.abs(h[11] + 1 / 6) < 1e-12);
  assert.ok(w.slice(8).every((v) => Math.abs(v - 1 / 3) < 1e-12));
  assert.equal(f64(r.clocks).length, 10);
  // a 32-bit library that is not an AMI model
  const junk32 = path.join(os.tmpdir(), 'hyperion-junk32.so');
  fs.writeFileSync(path.join(os.tmpdir(), 'j.c'), 'int x(void){return 1;}');
  execFileSync('gcc', ['-m32', '-shared', '-fPIC', path.join(os.tmpdir(), 'j.c'), '-o', junk32]);
  assert.match((await ami.run({ rows: 2, impulse: b64([1, 0]), dt: 1, ui: 1, params: '' }, { file: junk32 })).error, /no AMI_Init/);
});

test('a back-channel link with 32-bit models, alone or beside a 64-bit one (M581)', { skip: (!fs.existsSync(path.join(__dirname, '..', 'bin', 'ami-host32-linux')) || process.platform !== 'linux' || !built) && 'no 32-bit helper here' }, async () => {
  const b32 = path.join(os.tmpdir(), 'hyperion-bci-test32.so'), b64lib = path.join(os.tmpdir(), `hyperion-bci-test${ext}`);
  try { execFileSync('gcc', ['-m32', '-shared', '-fPIC', '-O2', path.join(__dirname, 'ami-test-bci.c'), '-o', b32]); } catch { return; }
  execFileSync('gcc', ['-shared', '-fPIC', '-O2', path.join(__dirname, 'ami-test-bci.c'), '-o', b64lib]);
  const p32 = { file: b32 }, p64 = { file: b64lib };
  const imp = new Array(64).fill(0); imp[0] = 1e12;
  const n = 8 * 400, wave = Array.from({ length: n }, (_, i) => (Math.floor(i / 8) % 2 ? 0.4 : -0.4));
  const req = { tx: { params: '(test_bci (role tx) (tap -0.1) (BCI_ID "l32"))' }, rx: { params: '(test_bci (role rx) (BCI_ID "l32"))' }, impulse: b64(imp), rows: 64, dt: 1e-12, ui: 8e-12, wave: b64(wave), interval: 32, training: 200 };
  const all64 = await ami.link(req, p64, p64);
  for (const [tx, rx] of [[p32, p32], [p32, p64], [p64, p32]]) {
    const r = await ami.link(req, tx, rx);
    assert.equal(r.ok, true, r.error);
    assert.match(r.history[0].tx, /tap -0.1\)/);
    assert.match(r.history[2].tx, /tap -0.35\)/);
    assert.deepEqual(r.files, ['l32.rx2tx']);
    assert.equal(f64(r.clocks).length, 400);
    assert.ok(f64(r.wave).every((v, i) => Math.abs(v - f64(all64.wave)[i]) < 1e-12));   // the same wave as with 64-bit models
  }
  // a refusing 32-bit Init says so
  const r = await ami.link({ ...req, rx: { params: '(test_bci (role rx))' } }, p64, p32);
  assert.match(r.error, /receiver's AMI_Init refused: no BCI_ID given/);
});
