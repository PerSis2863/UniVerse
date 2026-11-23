// Hyperion's computer app runs Julia, C++ and Rust with the copies installed on this computer (M470, the owner, 23 Nov:
// "Julia, C++ and Rust will run in the downloaded app using the copies already installed on the person's computer").
// Plain Node, used by main.js: find the tools, then write a script to a fresh folder, build it (C++, Rust) and run it,
// with time and output limits, and remove the folder afterwards. What may call this is decided in main.js.
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const exe = process.platform === 'win32' ? '.exe' : '';
const MAX_CODE = 1_000_000, MAX_OUT = 2_000_000, BUILD_MS = 120_000, RUN_MS = 300_000;

/** Apps started from a desktop don't get the shell's PATH on a Mac: add where these tools usually live. */
function toolPath() {
  const home = os.homedir(), sep = process.platform === 'win32' ? ';' : ':';
  const extra = process.platform === 'win32'
    ? [path.join(home, '.cargo', 'bin'), path.join(home, 'AppData', 'Local', 'Programs', 'Julia', 'bin'), path.join(home, '.julia', 'juliaup', 'bin'), 'C:\\msys64\\ucrt64\\bin', 'C:\\msys64\\mingw64\\bin']
    : [path.join(home, '.cargo', 'bin'), path.join(home, '.juliaup', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
  return [...(process.env.PATH || '').split(sep), ...extra].filter(Boolean).join(sep);
}
const env = () => ({ ...process.env, PATH: toolPath() });

/** The first line a tool prints for --version, or null when it isn't there. */
function version(cmd) {
  return new Promise((resolve) => {
    execFile(cmd, ['--version'], { env: env(), timeout: 8000, windowsHide: true }, (err, out, errOut) => {
      if (err) { resolve(null); return; }
      resolve(String(out || errOut).split('\n').find((l) => l.trim()) || cmd);
    });
  });
}

/** Which languages can run here, and with what. */
async function tools() {
  const [julia, gpp, clang, rustc] = await Promise.all([version('julia'), version('g++'), version('clang++'), version('rustc')]);
  return {
    julia: julia ? { cmd: 'julia', version: julia } : null,
    cpp: gpp ? { cmd: 'g++', version: gpp } : clang ? { cmd: 'clang++', version: clang } : null,
    rust: rustc ? { cmd: 'rustc', version: rustc } : null,
  };
}

/** How to install each tool, per system (shown by Hyperion when one is missing). */
const HOW = {
  julia: { win32: 'Install Julia with "winget install julia -s msstore" in a terminal, or from julialang.org/downloads.', darwin: 'Install Julia with "curl -fsSL https://install.julialang.org | sh" in Terminal, or from julialang.org/downloads.', linux: 'Install Julia with "curl -fsSL https://install.julialang.org | sh", or from julialang.org/downloads.' },
  cpp: { win32: 'Install a C++ compiler: MSYS2 from msys2.org, then "pacman -S mingw-w64-ucrt-x86_64-gcc" in its terminal.', darwin: 'Install Apple\'s compiler: run "xcode-select --install" in Terminal.', linux: 'Install a C++ compiler: "sudo apt install g++" (Debian, Ubuntu) or "sudo dnf install gcc-c++" (Fedora).' },
  rust: { win32: 'Install Rust from rustup.rs (it also asks for Visual Studio\'s C++ build tools).', darwin: 'Install Rust: run "curl --proto \'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh" in Terminal.', linux: 'Install Rust: run "curl --proto \'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh".' },
};
const howTo = (lang) => (HOW[lang] || {})[process.platform] || (HOW[lang] || {}).linux || '';

let running = null;

/** One process with a time limit; its output goes to onOut (capped), and it can be stopped. */
function step(cmd, args, cwd, ms, onOut) {
  return new Promise((resolve) => {
    let size = 0, cut = false, timedOut = false;
    const p = spawn(cmd, args, { cwd, env: env(), windowsHide: true });
    running = p;
    const take = (err) => (d) => {
      if (cut) return;
      const s = String(d);
      if (size + s.length > MAX_OUT) { cut = true; onOut(`${s.slice(0, Math.max(0, MAX_OUT - size))}\n… (the rest of the output was left out: over 2 MB)\n`, true); try { p.kill(); } catch { /* gone */ } return; }
      size += s.length;
      onOut(s, err);
    };
    p.stdout.on('data', take(false));
    p.stderr.on('data', take(true));
    const t = setTimeout(() => { timedOut = true; try { p.kill(); } catch { /* gone */ } }, ms);
    p.on('error', (e) => { clearTimeout(t); running = null; resolve({ code: -1, error: e.message, timedOut }); });
    p.on('close', (code, signal) => { clearTimeout(t); if (running === p) running = null; resolve({ code: code ?? -1, signal, timedOut, cut }); });
  });
}

/**
 * Builds (C++, Rust) and runs a script in a fresh folder; onOut(text, isError) streams its output.
 * Returns { ok, exitCode, error, ms }.
 */
async function run(lang, code, onOut) {
  if (!['julia', 'cpp', 'rust'].includes(lang)) return { ok: false, error: 'Unknown language.' };
  if (typeof code !== 'string' || code.length > MAX_CODE) return { ok: false, error: 'The script is too long (over 1 MB).' };
  if (running) return { ok: false, error: 'Something is still running: stop it first.' };
  const have = (await tools())[lang];
  if (!have) return { ok: false, missing: true, error: `${lang === 'cpp' ? 'No C++ compiler' : lang === 'rust' ? 'Rust' : 'Julia'} isn't installed on this computer. ${howTo(lang)}` };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperion-'));
  const t0 = Date.now();
  try {
    if (lang === 'julia') {
      fs.writeFileSync(path.join(dir, 'main.jl'), code);
      const r = await step(have.cmd, ['--startup-file=no', '--color=no', 'main.jl'], dir, RUN_MS, onOut);
      return finish(r, t0, 'Julia');
    }
    const src = lang === 'cpp' ? 'main.cpp' : 'main.rs', bin = path.join(dir, `main${exe}`);
    fs.writeFileSync(path.join(dir, src), code);
    const args = lang === 'cpp' ? ['-std=c++17', '-O2', src, '-o', bin] : ['-O', '--edition', '2021', src, '-o', bin];
    const b = await step(have.cmd, args, dir, BUILD_MS, onOut);
    if (b.code !== 0) return { ok: false, error: b.timedOut ? 'Building took over 2 minutes and was stopped.' : b.signal ? 'Stopped.' : `It didn't build (${have.cmd} said why above).`, ms: Date.now() - t0 };
    const r = await step(bin, [], dir, RUN_MS, onOut);
    return finish(r, t0, 'The program');
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* the system cleans its temporary folder */ }
  }
}
function finish(r, t0, who) {
  const ms = Date.now() - t0;
  if (r.cut) return { ok: false, error: `${who} printed over 2 MB and was stopped.`, ms };
  if (r.timedOut) return { ok: false, error: `${who} ran for over 5 minutes and was stopped.`, ms };
  if (r.signal) return { ok: false, error: 'Stopped.', ms };
  if (r.code !== 0) return { ok: false, exitCode: r.code, error: r.error || `${who} ended with code ${r.code}.`, ms };
  return { ok: true, exitCode: 0, ms };
}

/** Stop whatever is building or running. */
function stop() { if (running) { try { running.kill(); } catch { /* gone */ } } }

module.exports = { tools, run, stop, howTo };
