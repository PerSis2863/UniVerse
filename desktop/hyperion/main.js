// Hyperion as a computer app (M412, the owner, 22 Nov: "a signed desktop installer… PLEASE DO THIS", "we need to build
// all of these in the downloaded app"). A window of its own that opens Hyperion on the live site, so every new feature
// reaches the app the moment it reaches the website. Safe by default: the page has no access to the computer beyond
// what a browser gives it, other sites open in the normal browser, and only the site may use the camera or microphone.
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell, session } = require('electron');
const crypto = require('node:crypto');
const runner = require('./runner');
const fs = require('node:fs');
const path = require('node:path');

const SITE = process.env.HYPERION_URL || 'https://universeimpact.com/hyperion';
const ORIGIN = new URL(SITE).origin;
// Sign-in with Google or Microsoft opens their pages in a small window; anything else goes to the browser.
const SIGN_IN = [/^https:\/\/[\w-]+\.firebaseapp\.com\//, /^https:\/\/accounts\.google\.com\//, /^https:\/\/login\.microsoftonline\.com\//, /^https:\/\/appleid\.apple\.com\//];
const ours = (url) => { try { return new URL(url).origin === ORIGIN; } catch { return false; } };

if (!app.requestSingleInstanceLock()) app.quit();

// Smoothness: pages are drawn by the graphics chip (rasterisation) and handed to it without a copy.
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
// Behind the page before it paints and while the window resizes: the system's light or dark, never a white flash.
const BACK = () => (nativeTheme.shouldUseDarkColors ? '#070808' : '#f1f2f4');

const STATE = () => path.join(app.getPath('userData'), 'window.json');
function readBounds() { try { return JSON.parse(fs.readFileSync(STATE(), 'utf8')); } catch { return { width: 1440, height: 900 }; } }
function saveBounds() {
  if (!win) return;
  try { fs.writeFileSync(STATE(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() })); } catch { /* not kept */ }
}

let win = null;
function open() {
  const { maximized, ...b } = readBounds();
  win = new BrowserWindow({
    ...b, minWidth: 1100, minHeight: 700, title: 'Hyperion', backgroundColor: BACK(), show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    // bypassHeatCheck: the site's code is kept compiled from its first run, so the next start is quicker.
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true, v8CacheOptions: 'bypassHeatCheck', preload: path.join(__dirname, 'preload.js') },
    // Rounded window corners where the system offers them (macOS; Windows 11 rounds every window).
    roundedCorners: true,
  });
  // A browser's own name (some sign-in pages refuse unknown app windows).
  win.webContents.setUserAgent(win.webContents.getUserAgent().replace(/\sElectron\/\S+/, '').replace(/\shyperion-desktop\/\S+/, ''));
  // Shown once the page has painted, maximized again if it was; on a slow connection after 4 s at the latest.
  const show = () => { if (win && !win.isVisible()) { if (maximized) win.maximize(); win.show(); } };
  win.once('ready-to-show', show);
  setTimeout(show, 4000);
  win.on('close', saveBounds);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (ours(url) || SIGN_IN.some((r) => r.test(url))) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 700, webPreferences: { contextIsolation: true, sandbox: true } } };
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!ours(url) && !SIGN_IN.some((r) => r.test(url))) { e.preventDefault(); void shell.openExternal(url); } });
  // Signing in from the app opens on Hyperion's tab (the site would otherwise show its first app's).
  const toHyperionTab = (url) => {
    try {
      const u = new URL(url);
      if (ours(url) && (u.pathname === '/login' || u.pathname === '/register') && !u.searchParams.has('app')) { u.searchParams.set('app', 'lab'); void win.loadURL(u.toString()); }
    } catch { /* not a web address */ }
  };
  win.webContents.on('did-navigate', (_e, url) => toHyperionTab(url));
  win.webContents.on('did-navigate-in-page', (_e, url) => toHyperionTab(url));
  // No connection: a page that says so, with Try again.
  win.webContents.on('did-fail-load', (_e, code, _desc, url, mainFrame) => { if (mainFrame && code !== -3) void win.loadFile(path.join(__dirname, 'offline.html'), { query: { to: url || SITE } }); });
  void win.loadURL(SITE);
}

// Julia, C++ and Rust (M470): only Hyperion's own site, in the window's main frame (never a frame inside it), may ask,
// and the person says yes before a program runs: once per program text, or for the rest of this visit when they tick
// the box. A program run this way can do anything the person can, like any program they start themselves.
const NAMES = { julia: 'Julia', cpp: 'C++', rust: 'Rust' };
const trusted = (e) => !!win && e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame && ours(e.senderFrame.url);
const allowed = { all: new Set(), once: new Set() };
async function mayRun(lang, code) {
  const hash = crypto.createHash('sha256').update(`${lang}\0${code}`).digest('hex');
  if (allowed.all.has(lang) || allowed.once.has(hash)) return true;
  const { response, checkboxChecked } = await dialog.showMessageBox(win, {
    type: 'warning', buttons: [`Run the ${NAMES[lang]} program`, 'Cancel'], defaultId: 1, cancelId: 1, noLink: true,
    title: 'Run a program on this computer?',
    message: `Run this ${NAMES[lang]} program on your computer?`,
    detail: 'It runs with the same permissions as you, like any program you start yourself. Only run code you wrote or trust.',
    checkboxLabel: `Don't ask again for ${NAMES[lang]} until Hyperion is closed`,
  });
  if (response !== 0) return false;
  if (checkboxChecked) allowed.all.add(lang); else allowed.once.add(hash);
  return true;
}
ipcMain.handle('hyperion:tools', async (e) => {
  if (!trusted(e)) throw new Error('Not allowed.');
  const t = await runner.tools();
  return { ...t, how: { julia: runner.howTo('julia'), cpp: runner.howTo('cpp'), rust: runner.howTo('rust') } };
});
ipcMain.handle('hyperion:run', async (e, lang, code) => {
  if (!trusted(e)) throw new Error('Not allowed.');
  if (!NAMES[lang] || typeof code !== 'string') return { ok: false, error: 'Unknown language.' };
  // Nothing to ask about when the tool isn't here: say how to install it.
  if (!(await runner.tools())[lang]) return { ok: false, missing: true, error: `${lang === 'cpp' ? 'No C++ compiler' : NAMES[lang]} isn't installed on this computer. ${runner.howTo(lang)}` };
  if (!(await mayRun(lang, code))) return { ok: false, cancelled: true, error: 'Not run: you chose Cancel.' };
  const to = e.sender;
  return runner.run(lang, code, (text, isError) => { if (!to.isDestroyed()) to.send('hyperion:out', text, isError); });
});
ipcMain.handle('hyperion:stop', (e) => { if (trusted(e)) runner.stop(); });

// The File menu: within the page when it can (preload.js), so moving between Code, Simulate and Learn doesn't reload.
const goTo = (p) => { if (!win) return; if (ours(win.webContents.getURL())) win.webContents.send('hyperion:go', p); else void win.loadURL(`${ORIGIN}${p}`); };

app.whenReady().then(() => {
  // The connection to the site is opened while the window is being made.
  session.defaultSession.preconnect({ url: ORIGIN, numSockets: 2 });
  nativeTheme.on('updated', () => win?.setBackgroundColor(BACK()));
  // Only Hyperion's own site may ask for the camera, microphone, clipboard or notifications; nothing else.
  session.defaultSession.setPermissionRequestHandler((wc, permission, done) => done(ours(wc.getURL()) && ['media', 'clipboard-read', 'clipboard-sanitized-write', 'notifications', 'fullscreen'].includes(permission)));
  const mac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [{ label: 'Code', accelerator: 'CmdOrCtrl+1', click: () => goTo('/hyperion') }, { label: 'Simulate', accelerator: 'CmdOrCtrl+2', click: () => goTo('/hyperion/simulate') }, { label: 'Learn', accelerator: 'CmdOrCtrl+3', click: () => goTo('/hyperion/learn') }, { type: 'separator' }, mac ? { role: 'close' } : { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Open Hyperion in the browser', click: () => shell.openExternal(SITE) }, { label: `About Hyperion ${app.getVersion()}`, click: () => app.showAboutPanel() }] },
  ]));
  app.setAboutPanelOptions({ applicationName: 'Hyperion', applicationVersion: app.getVersion(), copyright: 'UniVerse Impact' });
  open();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) open(); });
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
app.on('window-all-closed', () => { runner.stop(); if (process.platform !== 'darwin') app.quit(); });
