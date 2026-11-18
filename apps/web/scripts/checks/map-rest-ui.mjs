// M290: a canvas map whose page asks for pulses (Relief's live map) rests when nobody touches anything for 30 s
// and wakes at a touch. Measured on a phone with the processor slowed 4×: main-thread busy share and frames asked
// for a second. Runs against `local:serve` (or BASE=…).
import { playwright, signedIn } from '../browser-session.mjs';
const base = process.env.BASE ?? 'http://localhost:8787';
const browser = await playwright().chromium.launch();
const ctx = await signedIn(browser, base, 'alice@student.com', { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.addInitScript(() => { window.__raf = 0; const r = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => r((t) => { window.__raf++; cb(t); }); });
await page.goto(`${base}/relief`, { waitUntil: 'load', timeout: 180_000 });
await cdp.send('Performance.enable');
const g = (x, n) => x.metrics.find((q) => q.name === n)?.value ?? 0;
const probe = async () => {
  const a = await cdp.send('Performance.getMetrics'), r0 = await page.evaluate(() => window.__raf);
  await page.waitForTimeout(4000);
  const b = await cdp.send('Performance.getMetrics'), r1 = await page.evaluate(() => window.__raf);
  return { cpu: Math.round(((g(b, 'TaskDuration') - g(a, 'TaskDuration')) / 4) * 100), fps: (r1 - r0) / 4 };
};
await page.waitForTimeout(6000);
const live = await probe();
await page.waitForTimeout(28_000);
const rest = await probe();
await page.mouse.move(200, 420);
await page.waitForTimeout(300);
const woken = await probe();
await browser.close();
console.log(JSON.stringify({ live, rest, woken }));
const fails = [];
if (live.fps > 40) fails.push(`pulsing at ${live.fps} frames a second (30 expected)`);
if (rest.fps > 3 || rest.cpu > 10) fails.push(`not resting after 30 s: ${rest.fps} frames a second, ${rest.cpu}% busy`);
if (woken.fps < 15) fails.push(`not woken by the mouse: ${woken.fps} frames a second`);
if (fails.length) { console.error('FAILED\n' + fails.join('\n')); process.exit(1); }
console.log('map-rest-ui: all good');
