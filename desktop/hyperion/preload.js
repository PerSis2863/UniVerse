// Hyperion's computer app (M412, M470): tells the page it is running inside the app (so it hides "Install Hyperion"),
// lets Hyperion's own page run Julia, C++ and Rust with the tools installed on this computer, and IBIS-AMI models (M577). main.js answers only
// Hyperion's own site in the window's main frame, and asks the person before a program runs.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hyperionDesktop', Object.freeze({
  app: true,
  platform: process.platform,
  /** Which of Julia, C++ and Rust are installed here: { julia, cpp, rust }, each { cmd, version } or null. */
  tools: () => ipcRenderer.invoke('hyperion:tools'),
  /** Build and run a script; its output arrives through onOutput. Resolves { ok, exitCode, error, missing, ms }. */
  run: (lang, code) => ipcRenderer.invoke('hyperion:run', String(lang), String(code)),
  stop: () => ipcRenderer.invoke('hyperion:stop'),
  /** IBIS-AMI models (M577): the private address and this launch's token, handed to Hyperion's engine worker. */
  native: () => ipcRenderer.invoke('hyperion:native'),
  /** The running program's output as it comes: cb(text, isError). Returns a function that stops listening. */
  onOutput: (cb) => {
    const f = (_e, text, isError) => cb(String(text), !!isError);
    ipcRenderer.on('hyperion:out', f);
    return () => ipcRenderer.removeListener('hyperion:out', f);
  },
}));
