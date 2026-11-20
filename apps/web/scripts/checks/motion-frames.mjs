// M337 (the owner, 19 Nov: "make the whole app in mobile and website animations ultra smooth"): the motion that
// smooth-frames.mjs (scrolling, maps) and main-pages-smooth.mjs (loading, sitting still) don't measure: moving
// between pages, and opening the menu, the notifications and a sheet. On a modest phone (390 × 844, the CPU slowed
// 4×) and a computer. For each it lists the frames over 20 ms and the code behind the slowest (Chrome's
// long-animation-frame entries). Run against `pnpm local:serve` (the built site):
//   node scripts/checks/motion-frames.mjs [base] [--phone-only] [--only <step name>]
import { launch, signedIn } from '../browser-session.mjs';

const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:8787';
const phoneOnly = process.argv.includes('--phone-only');
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const sizes = [['phone', 390, 844, 4], ['computer', 1440, 900, 1]].filter(([n]) => !phoneOnly || n === 'phone');

const record = () => {
  window.__frames = []; window.__loaf = [];
  let last = performance.now();
  const f = (t) => { window.__frames.push(t - last); last = t; if (window.__rec) requestAnimationFrame(f); };
  window.__rec = true; requestAnimationFrame(f);
  window.__po = new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__loaf.push({ d: Math.round(e.duration), style: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0), scripts: e.scripts.map((s) => `${Math.round(s.duration)}ms ${s.invoker || s.invokerType} ${s.sourceFunctionName || ''} ${(s.sourceURL || '').split('/').pop()}:${s.sourceCharPosition}`).slice(0, 3) }); });
  window.__po.observe({ type: 'long-animation-frame' });
};
const stop = () => { window.__rec = false; window.__po.disconnect(); const f = window.__frames.slice(1); return { n: f.length, over20: f.filter((x) => x > 20).length, over34: f.filter((x) => x > 34).length, worst: Math.round(Math.max(0, ...f)), loaf: window.__loaf }; };

// Each step: a name, what to do, how long to watch afterwards.
const nav = (phone) => (phone ? 'nav[aria-label="Primary"] a' : 'header nav a, aside nav a');
const STEPS = [
  ['tab 2', async (p, phone) => p.locator(nav(phone)).nth(1).click(), 1800],
  ['tab 3', async (p, phone) => p.locator(nav(phone)).nth(2).click(), 1800],
  ['back home', async (p, phone) => p.locator(nav(phone)).nth(0).click(), 1800],
  ['notifications open', async (p) => p.locator('button[aria-label^="Notifications"]').first().click(), 900],
  ['notifications close', async (p) => p.keyboard.press('Escape'), 700],
  ['menu open', async (p, phone) => (phone ? p.locator('nav[aria-label="Primary"] button').last().click() : p.locator('button[aria-haspopup]').first().click()), 900],
  ['menu close', async (p) => p.keyboard.press('Escape'), 700],
].filter(([n]) => !only || n === only);

const browser = await launch();
for (const [size, w, h, slow] of sizes) {
  const phone = size === 'phone';
  const ctx = await signedIn(browser, base, 'alice@student.com', { width: w, height: h }, phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {});
  await ctx.addInitScript(() => localStorage.setItem('uv-cookies', 'essential'));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(base + '/student', { waitUntil: 'load', timeout: 180_000 });
  await page.waitForTimeout(6000);
  if (slow > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
  console.log(`\n${size}${slow > 1 ? ` (CPU ${slow}x slower)` : ''}`);
  for (const [name, act, watch] of STEPS) {
    await page.evaluate(record);
    try { await act(page, phone); } catch (e) { console.log(`  ${name}: skipped (${e.message.split('\n')[0].slice(0, 80)})`); await page.evaluate(stop); continue; }
    await page.waitForTimeout(watch);
    const r = await page.evaluate(stop);
    console.log(`  ${name} (${new URL(page.url()).pathname}): ${r.n} frames, ${r.over20} over 20 ms, ${r.over34} over 34 ms, worst ${r.worst} ms`);
    for (const l of r.loaf.sort((a, b) => b.d - a.d).slice(0, 3)) console.log(`     ${l.d} ms (style+layout ${l.style})  ${l.scripts.join(' | ')}`);
  }
  await ctx.close();
}
await browser.close();
