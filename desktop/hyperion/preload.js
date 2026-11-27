// Hyperion's computer app (M412, M470): tells the page it is running inside the app (so it hides "Install Hyperion"),
// and lets Hyperion's own page run Julia, C++ and Rust, and chip and circuit simulators (M569), with the tools installed
// on this computer. main.js answers only
// Hyperion's own site in the window's main frame, and asks the person before a program runs.
const { contextBridge, ipcRenderer } = require('electron');

// The File menu's Code / Simulate / Learn: the page moves there as a link does (no reload) when it listens; an older
// site that doesn't is loaded at that address instead.
let go = null;
ipcRenderer.on('hyperion:go', (_e, path) => {
  const to = String(path);
  if (!to.startsWith('/hyperion')) return;
  if (go) go(to); else location.assign(to);
});

contextBridge.exposeInMainWorld('hyperionDesktop', Object.freeze({
  app: true,
  platform: process.platform,
  /** Which of Julia, C++ and Rust are installed here: { julia, cpp, rust }, each { cmd, version } or null. */
  tools: () => ipcRenderer.invoke('hyperion:tools'),
  /** Build and run a script; its output arrives through onOutput. Resolves { ok, exitCode, error, missing, ms }. */
  run: (lang, code) => ipcRenderer.invoke('hyperion:run', String(lang), String(code)),
  stop: () => ipcRenderer.invoke('hyperion:stop'),
  /** M569: chip and circuit simulators installed here: { id: { name, kind: 'sv' | 'spice', path } }. */
  simulators: () => ipcRenderer.invoke('hyperion:simulators'),
  /** Runs one on files { name: text } (top: the SystemVerilog top module or the netlist's file name); output arrives
   *  through onOutput. Resolves { ok, exitCode, error, missing, ms, raw } (raw: a circuit simulator's results, base64). */
  simulate: (id, files, top) => ipcRenderer.invoke('hyperion:simulate', String(id), files, String(top)),
  /** Called with a Hyperion path when the File menu asks to go there. Returns a function that stops listening. */
  onGo: (cb) => {
    const f = (to) => cb(to);
    go = f;
    return () => { if (go === f) go = null; };
  },
  /** The running program's output as it comes: cb(text, isError). Returns a function that stops listening. */
  onOutput: (cb) => {
    const f = (_e, text, isError) => cb(String(text), !!isError);
    ipcRenderer.on('hyperion:out', f);
    return () => ipcRenderer.removeListener('hyperion:out', f);
  },
}));
