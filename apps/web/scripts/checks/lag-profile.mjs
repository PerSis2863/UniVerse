// M225 where the site lags: each page opened with the CPU slowed 4x (a modest laptop or a phone), then scrolled
// down and up and the mouse moved over it: frames slower than 50 ms, the slowest, long tasks (main-thread work over
// 50 ms) and their total, while loading and while in use. OFF=<what> turns a suspect off by CSS/flag to compare
// (backdrop: the app's scene behind the page). Runs against `local:serve` (or BASE=… for local:dev).
import { launch, signedIn } from '../browser-session.mjs';
const base = process.env.BASE ?? 'http://localhost:8787', off = process.env.OFF ?? '';
const pages = (process.env.PAGES ?? '/,/student,/admin,/student/inbox,/trace,/green').split(',');
const browser = await launch();
const out = {};
for (const path of pages) {
  const ctx = path === '/' ? await browser.newContext({ viewport: { width: 1280, height: 800 } })
    : await signedIn(browser, base, path.startsWith('/admin') ? 'demo@admin.com' : 'alice@student.com', { width: 1280, height: 800 });
  await ctx.addInitScript((o) => {
    localStorage.setItem('uv-cookies', 'essential');
    window.__long = []; window.__frames = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true });
    if (o.includes('backdrop')) document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'canvas[data-backdrop], .app-backdrop, [data-app-backdrop] { display: none !important; }'; document.head.appendChild(s); });
  }, off);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 240_000 });
  await page.waitForTimeout(4000);
  const loadMs = Date.now() - t0;
  const loadLong = await page.evaluate(() => window.__long.slice());
  // In use: frames while scrolling and moving the mouse.
  await page.evaluate(() => { window.__long = []; window.__frames = []; let last = performance.now(); const f = (t) => { window.__frames.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.mouse.move(640, 400);
  for (let i = 0; i < 24; i++) { await page.mouse.wheel(0, 260); await page.mouse.move(300 + (i * 37) % 700, 200 + (i * 53) % 400); await page.waitForTimeout(70); }
  for (let i = 0; i < 24; i++) { await page.mouse.wheel(0, -260); await page.waitForTimeout(70); }
  await page.waitForTimeout(500);
  const use = await page.evaluate(() => { window.__stop = true; const f = window.__frames.slice(2); const s = [...f].sort((a, b) => a - b); return { frames: f.length, slow: f.filter((d) => d > 50).length, p95: Math.round(s[Math.floor(s.length * 0.95)] ?? 0), worst: Math.round(s[s.length - 1] ?? 0), long: window.__long.length, longMs: window.__long.reduce((n, l) => n + l[1], 0) }; });
  out[path] = { loadMs, loadLong: loadLong.length, loadLongMs: loadLong.reduce((n, l) => n + l[1], 0), ...use };
  await ctx.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
