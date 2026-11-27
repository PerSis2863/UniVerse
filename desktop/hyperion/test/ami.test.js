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
