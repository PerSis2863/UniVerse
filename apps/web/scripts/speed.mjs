// How fast pages open on a low-end phone (M46): a 390 × 844 touch screen with the CPU slowed 4×
// (about a budget Android phone) on a slow mobile connection (Lighthouse's "Slow 4G": 150 ms round
// trips, 1.6 Mb/s down, 750 kb/s up). Each page is opened twice: a first visit (nothing saved) and a
// return visit (the browser's and the service worker's copies), as a visitor and as a student.
//
//   pnpm local:serve --test-secret            (in another terminal: the built site)
//   node scripts/speed.mjs [http://localhost:8787] [--slow 4] [--json out.json] [--path /student]
//
// Reports per page and visit: first paint (FCP), largest paint (LCP), main-thread blocking (the
// long tasks' time over 50 ms each, like Lighthouse's TBT), what was downloaded (scripts / all, kB
// as sent), and after the return visit how much of the time the processor is free 8 s later (the
// page's own animations; the river holds still on a phone it would keep busy). Good on phones: FCP under 1.8 s, LCP under 2.5 s, blocking under 200 ms (a local
// server answers faster than Cloudflare does, so real first visits add the server's time).
import { writeFileSync } from 'node:fs';
import { baseUrl, launch, signedIn } from './browser-session.mjs';

const base = baseUrl();
const arg = (name, d) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : d);
const slow = Number(arg('--slow', '4'));
const only = arg('--path', null);
const jsonOut = arg('--json', null);
const phone = { isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const VIEW = { width: 390, height: 844 };

const PLAN = [
  { who: null, paths: ['/', '/login'] },
  { who: 'demo@student.com', paths: ['/student', '/student/courses', '/student/inbox', '/student/calendar', '/hub'] },
].map((p) => ({ ...p, paths: p.paths.filter((x) => !only || x === only) })).filter((p) => p.paths.length);

const metrics = () => new Promise((resolve) => {
  // Read after the page has settled: paints, long tasks and what was downloaded.
  const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
  const res = performance.getEntriesByType('resource');
  const nav = performance.getEntriesByType('navigation')[0];
  const kb = (list) => Math.round(list.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024);
  resolve({
    fcp: fcp && Math.round(fcp),
    lcp: window.__lcp ? Math.round(window.__lcp) : null,
    blocking: Math.round(window.__long),
    js: kb(res.filter((r) => r.initiatorType === 'script' || r.name.endsWith('.js'))),
    all: kb([...res, nav].filter(Boolean)),
  });
});

/** Share of time the processor is idle, sampled for 2.5 s once the page has been open 8 s. */
async function freeTime(page, cdp) {
  await page.waitForTimeout(5000);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
  await page.waitForTimeout(2500);
  const { profile } = await cdp.send('Profiler.stop');
  const idle = new Set(profile.nodes.filter((n) => n.callFrame.functionName === '(idle)').map((n) => n.id));
  let all = 0, free = 0;
  profile.samples.forEach((id, i) => { const d = profile.timeDeltas[i] ?? 0; all += d; if (idle.has(id)) free += d; });
  return Math.round((100 * free) / Math.max(1, all));
}

const browser = await launch();
const results = [];
for (const { who, paths } of PLAN) {
  for (const path of paths) {
    const ctx = who ? await signedIn(browser, base, who, VIEW, phone) : await browser.newContext({ viewport: VIEW, ...phone });
    await ctx.addInitScript(() => {
      window.__lcp = 0; window.__long = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
    });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
    for (const visit of ['first', 'return']) {
      if (visit === 'first') await page.goto(base + path, { waitUntil: 'load', timeout: 120_000 });
      else await page.reload({ waitUntil: 'load', timeout: 120_000 });
      await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const m = await page.evaluate(metrics);
      if (visit === 'return') m.free = await freeTime(page, cdp);
      const r = { path, who: who ? 'student' : 'visitor', visit, ...m };
      results.push(r);
      console.log(`${(path + ' ' + visit).padEnd(26)} FCP ${String(m.fcp).padStart(5)} ms  LCP ${String(m.lcp).padStart(5)} ms  blocking ${String(m.blocking).padStart(5)} ms  scripts ${String(m.js).padStart(4)} kB  all ${String(m.all).padStart(5)} kB${m.free === undefined ? '' : `  free ${m.free}%`}`);
    }
    await ctx.close();
  }
}
await browser.close();
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));
