// Hyperion's computer app runs chip and circuit simulators installed on this computer (M569, the owner, 27 Nov: "do all
// these": run the SystemVerilog testbench, and the links to Cadence and Synopsys tools). Hyperion writes the files
// (dpigen's SystemVerilog and C, spicegen's netlists); this runs the simulator the person has, free (Verilator, ngspice,
// Xyce) or licensed (Cadence Xcelium and Spectre, Synopsys VCS and HSPICE, Siemens Questa), in a fresh folder with time
// and output limits, and gives back what it printed and, for circuit simulators, the results file (a SPICE raw file).
// Nothing is bundled and no licence is touched: a licensed tool runs only where the person already has it.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { step, env } = require('./runner');

const SIMS = {
  verilator: { kind: 'sv', name: 'Verilator' },
  xrun: { kind: 'sv', name: 'Cadence Xcelium' },
  vcs: { kind: 'sv', name: 'Synopsys VCS' },
  qrun: { kind: 'sv', name: 'Siemens Questa' },
  ngspice: { kind: 'spice', name: 'ngspice' },
  Xyce: { kind: 'spice', name: 'Xyce' },
  spectre: { kind: 'spice', name: 'Cadence Spectre' },
  hspice: { kind: 'spice', name: 'Synopsys HSPICE' },
};
const EXT = /\.(sv|svh|v|vh|c|h|cir|sp|spi|scs|net|va|inc|lib|txt)$/i;
const MAX_FILES = 64, MAX_BYTES = 4_000_000, BUILD_MS = 600_000, RUN_MS = 600_000;
const exe = process.platform === 'win32' ? '.exe' : '';

/** Where a command is on this computer's PATH (no licence is checked out to find it), or null. */
function where(cmd) {
  const sep = process.platform === 'win32' ? ';' : ':', exts = process.platform === 'win32' ? ['.exe', '.bat', '.cmd', ''] : [''];
  for (const dir of (env().PATH || '').split(sep)) for (const x of exts) { const p = path.join(dir, cmd + x); try { if (fs.statSync(p).isFile()) return p; } catch { /* not here */ } }
  return null;
}
/** Which simulators are here: { id: { name, kind, path } }. */
function simulators() {
  const out = {};
  for (const [id, s] of Object.entries(SIMS)) { const p = where(id); if (p) out[id] = { ...s, path: p }; }
  return out;
}

/**
 * Runs one simulator on the files (name → text), top being the SystemVerilog top module or the netlist's file name.
 * onOut(text, isError) streams what it prints. Resolves { ok, exitCode, error, ms, raw } (raw: the results file,
 * base64, from a circuit simulator).
 */
async function simulate(id, files, top, onOut) {
  const s = SIMS[id];
  if (!s) return { ok: false, error: 'Unknown simulator.' };
  if (!where(id)) return { ok: false, missing: true, error: `${s.name} isn't installed on this computer (or isn't on its PATH).` };
  if (!files || typeof files !== 'object') return { ok: false, error: 'No files.' };
  const names = Object.keys(files);
  if (!names.length || names.length > MAX_FILES) return { ok: false, error: `Between 1 and ${MAX_FILES} files.` };
  let bytes = 0;
  for (const n of names) {
    if (!/^[\w.-]+$/.test(n) || !EXT.test(n)) return { ok: false, error: `“${n}”: only plain file names ending in .sv, .v, .c, .h, .cir, .sp, .scs, .va and the like.` };
    if (typeof files[n] !== 'string') return { ok: false, error: `“${n}” isn't text.` };
    bytes += files[n].length;
  }
  if (bytes > MAX_BYTES) return { ok: false, error: 'The files are over 4 MB together.' };
  if (typeof top !== 'string' || !/^[\w.-]+$/.test(top)) return { ok: false, error: 'Name the top module (SystemVerilog) or the netlist file (SPICE).' };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperion-sim-'));
  const t0 = Date.now();
  const done = (r, who, raw = null) => {
    const ms = Date.now() - t0;
    if (r.timedOut) return { ok: false, error: `${who} ran for over 10 minutes and was stopped.`, ms };
    if (r.signal) return { ok: false, error: 'Stopped.', ms };
    if (r.code !== 0) return { ok: false, exitCode: r.code, error: r.error || `${who} ended with code ${r.code}.`, ms, raw };
    return { ok: true, exitCode: 0, ms, raw };
  };
  try {
    for (const n of names) fs.writeFileSync(path.join(dir, n), files[n]);
    const sv = names.filter((n) => /\.(sv|v)$/i.test(n)), c = names.filter((n) => /\.c$/i.test(n));
    if (s.kind === 'sv') {
      if (!/^[A-Za-z_]\w*$/.test(top)) return { ok: false, error: 'The top module is a SystemVerilog name.' };
      if (!sv.length) return { ok: false, error: 'No SystemVerilog files (.sv) to simulate.' };
      if (id === 'verilator') {
        const b = await step('verilator', ['--binary', '--timing', '-Wno-fatal', '--top-module', top, ...sv, ...c], dir, BUILD_MS, onOut);
        if (b.code !== 0) return done(b, 'Verilator');
        return done(await step(path.join(dir, 'obj_dir', `V${top}${exe}`), [], dir, RUN_MS, onOut), 'The simulation');
      }
      if (id === 'vcs') {
        const b = await step('vcs', ['-sverilog', '-full64', '-timescale=1ns/1ps', '-top', top, ...sv, ...c, '-o', 'simv'], dir, BUILD_MS, onOut);
        if (b.code !== 0) return done(b, 'VCS');
        return done(await step(path.join(dir, `simv${exe}`), [], dir, RUN_MS, onOut), 'The simulation');
      }
      // Xcelium and Questa compile the C (DPI) and run in one command
      const args = id === 'xrun' ? ['-sv', '-timescale', '1ns/1ps', '-top', top, ...sv, ...c] : ['-sv', '-top', top, ...sv, ...c];
      return done(await step(id, args, dir, BUILD_MS + RUN_MS, onOut), s.name);
    }
    // circuit simulators: the netlist named by top, results written as a raw file Hyperion reads (rawread)
    if (!files[top]) return { ok: false, error: `No netlist called “${top}” among the files.` };
    const args = id === 'ngspice' ? ['-b', '-r', 'out.raw', top]
      : id === 'Xyce' ? ['-r', 'out.raw', '-a', top]
      : id === 'spectre' ? [top, '-format', 'nutascii', '-raw', 'out.raw', '+escchars']
      : ['-i', top, '-o', 'out'];
    const r = await step(id, args, dir, RUN_MS, onOut);
    const rawFile = path.join(dir, 'out.raw');
    const raw = fs.existsSync(rawFile) && fs.statSync(rawFile).size < 50_000_000 ? fs.readFileSync(rawFile).toString('base64') : null;
    if (id === 'hspice') { const lis = path.join(dir, 'out.lis'); if (fs.existsSync(lis)) onOut(fs.readFileSync(lis, 'utf8').slice(0, 1_000_000), false); }
    return done(r, s.name, raw);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* the system cleans its temporary folder */ }
  }
}

module.exports = { SIMS, simulators, simulate };
