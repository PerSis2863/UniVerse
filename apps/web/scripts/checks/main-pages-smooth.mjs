// M211 (the owner, 16 Nov: "the website and app lagg alot in the main page"): how the main pages feel —
// the website's landing (signed out) and each app's home (signed in) — on a computer and on a modest
// phone (390 × 844, the CPU slowed 4×). For each: the main thread's long tasks while it loads (over
// 8 s), frames while it sits still for 3 s (decorative motion must not cost frames), frames while
// scrolling down, and the busiest functions while still (a CPU profile). Runs against `local:serve`.
//
//   node scripts/checks/main-pages-smooth.mjs [--only /hub] [--phone-only]
import { playwright, signedIn } from '../browser-session.mjs';

const base = process.env.BASE ?? 'http://localhost:8787';
const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const only = arg('--only'), phoneOnly = process.argv.includes('--phone-only');
// M282: every app's home.
const PAGES = [['/', null], ['/hub', 'alice@student.com'], ['/student', 'alice@student.com'], ['/teacher', 'tara@teacher.com'], ['/admin', 'demo@admin.com'], ['/travel', 'alice@student.com'], ['/trace', 'alice@student.com'], ['/relief', 'alice@student.com'], ['/green', 'alice@student.com'], ['/play', 'alice@student.com']].filter(([p]) => !only || p === only);
const sizes = [['phone', 390, 844, 4], ['computer', 1440, 900, 1]].filter(([n]) => !phoneOnly || n === 'phone');

const browser = await playwright().chromium.launch();
const out = [];
const stats = (f) => { const s = [...f].sort((a, b) => a - b); return { frames: f.length, slow: f.filter((x) => x > 34).length, worst: Math.round(s[s.length - 1] ?? 0), p95: Math.round(s[Math.floor(s.length * 0.95)] ?? 0) }; };

for (const [path, who] of PAGES) for (const [name, w, h, slow] of sizes) {
  const phone = name === 'phone';
  const opts = phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {};
  const ctx = who ? await signedIn(browser, base, who, { width: w, height: h }, opts) : await browser.newContext({ viewport: { width: w, height: h }, ...opts });
  await ctx.addInitScript(() => {
    localStorage.setItem('uv-cookies', 'essential');
    window.__long = []; window.__frames = []; window.__rec = false;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: 'longtask', buffered: true });
    let last = 0;
    const tick = (t) => { if (window.__rec) window.__frames.push(t - last); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (slow > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));
  const t0 = Date.now();
  await page.goto(base + path, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForTimeout(8000);
  const load = await page.evaluate(() => { const l = window.__long; return { longTasks: l.length, longMs: Math.round(l.reduce((a, b) => a + b, 0)), worst: Math.round(Math.max(0, ...l)) }; });
  // Still: 3 s of frames, then 3 s with a CPU profile of what runs (starting the profiler itself
  // stalls a slowed page, so it isn't counted in the frames).
  await page.evaluate(() => { window.__frames = []; window.__rec = true; });
  await page.waitForTimeout(3000);
  const still = stats(await page.evaluate(() => { window.__rec = false; return window.__frames; }));
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  await page.waitForTimeout(3000);
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = profile.timeDeltas ?? [];
  (profile.samples ?? []).forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber}`; if (!/\(idle\)|\(program\)|\(garbage/.test(k)) self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000); });
  const busy = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, ms]) => `${Math.round(ms)}ms ${k}`);
  const busyTotal = Math.round([...self.values()].reduce((a, b) => a + b, 0));
  // Scrolling down.
  await page.evaluate(() => { window.__frames = []; window.__rec = true; });
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(120); }
  await page.waitForTimeout(500);
  const scroll = stats(await page.evaluate(() => { window.__rec = false; return window.__frames; }));
  out.push({ path, size: name, cpu: `${slow}x`, loadedIn: `${Math.round((Date.now() - t0) / 100) / 10}s`, load, still, busyWhileStill: `${busyTotal}ms of 3000`, busy, scroll, errors });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 2));
