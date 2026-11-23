// Hyperion as a computer app (M412, the owner, 22 Nov: "a signed desktop installer… PLEASE DO THIS", "we need to build
// all of these in the downloaded app"). A window of its own that opens Hyperion on the live site, so every new feature
// reaches the app the moment it reaches the website. Safe by default: the page has no access to the computer beyond
// what a browser gives it, other sites open in the normal browser, and only the site may use the camera or microphone.
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SITE = process.env.HYPERION_URL || 'https://universeimpact.com/hyperion';
const ORIGIN = new URL(SITE).origin;
// Sign-in with Google or Microsoft opens their pages in a small window; anything else goes to the browser.
const SIGN_IN = [/^https:\/\/[\w-]+\.firebaseapp\.com\//, /^https:\/\/accounts\.google\.com\//, /^https:\/\/login\.microsoftonline\.com\//, /^https:\/\/appleid\.apple\.com\//];
const ours = (url) => { try { return new URL(url).origin === ORIGIN; } catch { return false; } };

if (!app.requestSingleInstanceLock()) app.quit();

const STATE = () => path.join(app.getPath('userData'), 'window.json');
function readBounds() { try { return JSON.parse(fs.readFileSync(STATE(), 'utf8')); } catch { return { width: 1440, height: 900 }; } }

let win = null;
function open() {
  const b = readBounds();
  win = new BrowserWindow({
    ...b, minWidth: 1100, minHeight: 700, title: 'Hyperion', backgroundColor: '#f1f2f4', show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true, preload: path.join(__dirname, 'preload.js') },
    // Rounded window corners where the system offers them (macOS; Windows 11 rounds every window).
    roundedCorners: true,
  });
  // A browser's own name (some sign-in pages refuse unknown app windows).
  win.webContents.setUserAgent(win.webContents.getUserAgent().replace(/\sElectron\/\S+/, '').replace(/\shyperion-desktop\/\S+/, ''));
  win.once('ready-to-show', () => win.show());
  win.on('close', () => { try { fs.writeFileSync(STATE(), JSON.stringify(win.getBounds())); } catch { /* not kept */ } });
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

app.whenReady().then(() => {
  // Only Hyperion's own site may ask for the camera, microphone, clipboard or notifications; nothing else.
  session.defaultSession.setPermissionRequestHandler((wc, permission, done) => done(ours(wc.getURL()) && ['media', 'clipboard-read', 'clipboard-sanitized-write', 'notifications', 'fullscreen'].includes(permission)));
  const mac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [{ label: 'Code', accelerator: 'CmdOrCtrl+1', click: () => win?.loadURL(`${ORIGIN}/hyperion`) }, { label: 'Simulate', accelerator: 'CmdOrCtrl+2', click: () => win?.loadURL(`${ORIGIN}/hyperion/simulate`) }, { type: 'separator' }, mac ? { role: 'close' } : { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Open Hyperion in the browser', click: () => shell.openExternal(SITE) }, { label: `About Hyperion ${app.getVersion()}`, click: () => app.showAboutPanel() }] },
  ]));
  app.setAboutPanelOptions({ applicationName: 'Hyperion', applicationVersion: app.getVersion(), copyright: 'UniVerse Impact' });
  open();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) open(); });
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
