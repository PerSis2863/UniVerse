// M335: how smooth scrolling and the maps are, measured. For each page it scrolls with the wheel (pages) or drags,
// flings and wheel-zooms (maps), and reports the frames and the slow ones with the code that made them slow
// (Chrome's long-animation-frame entries). Run against `pnpm local:serve` (the built site):
//   node scripts/checks/smooth-frames.mjs [base] [--only /path]
import { launch, signedIn } from '../browser-session.mjs';

const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:8787';
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const PAGES = [
  ['/', 'scroll', null],
  ['/student', 'scroll', 'demo@student.com'],
  ['/travel?view=map', 'map', 'demo@student.com'],
  ['/green?view=places', 'map', 'demo@student.com'],
  ['/relief?view=alerts', 'map', 'demo@student.com'],
  ['/trace/tracking', 'map', 'demo@student.com'],
].filter(([p]) => !only || p === only);

const browser = await launch();
const startRecording = () => {
  window.__frames = []; window.__loaf = [];
  let last = performance.now();
  const f = (t) => { window.__frames.push(t - last); last = t; if (window.__rec) requestAnimationFrame(f); };
  window.__rec = true; requestAnimationFrame(f);
  window.__po = new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__loaf.push({ d: Math.round(e.duration), block: Math.round(e.blockingDuration), render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0), style: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0), scripts: e.scripts.map((s) => `${Math.round(s.duration)}ms ${s.invoker || s.invokerType} ${(s.sourceFunctionName || '')} ${(s.sourceURL || '').split('/').pop()}:${s.sourceCharPosition}`).slice(0, 3) }); });
  window.__po.observe({ type: 'long-animation-frame' });
};
const stopRecording = () => { window.__rec = false; window.__po.disconnect(); const f = window.__frames.slice(1); return { n: f.length, over20: f.filter((x) => x > 20).length, over34: f.filter((x) => x > 34).length, worst: Math.round(Math.max(...f)), loaf: window.__loaf }; };

for (const [path, kind, email] of PAGES) {
  const ctx = email ? await signedIn(browser, base, email, { width: 1280, height: 800 }) : await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(base + path, { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  await page.evaluate(startRecording);
  if (kind === 'scroll') {
    await page.mouse.move(640, 500);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(90); }
    await page.waitForTimeout(2600);
  } else {
    const map = page.locator('.maplibregl-canvas, canvas').first();
    const b = await map.boundingBox();
    if (!b) { console.log(path, 'no map'); await ctx.close(); continue; }
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 1; i <= 20; i++) { await page.mouse.move(cx - i * 12, cy - i * 5); await page.waitForTimeout(16); } // a drag and fling
    await page.mouse.up(); await page.waitForTimeout(1200);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(80); } // zoom in
    await page.waitForTimeout(1500);
  }
  const r = await page.evaluate(stopRecording);
  console.log(`${path}: ${r.n} frames, ${r.over20} over 20 ms, ${r.over34} over 34 ms, worst ${r.worst} ms`);
  for (const l of r.loaf.sort((a, b) => b.d - a.d).slice(0, 4)) console.log(`   ${l.d} ms (blocking ${l.block}, style+layout ${l.style}, render ${l.render})  ${l.scripts.join(' | ')}`);
  await ctx.close();
}
await browser.close();
