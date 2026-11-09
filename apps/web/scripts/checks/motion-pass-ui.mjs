// M130 (built Worker): the motion pass. (1) The landing's app switch: the page's own frames through
// each switch (the hero's picture and the rest follow in a render React can pause, so no long frame).
// (2) Content replacing a loading placeholder glides in (src/lib/scroll-motion.ts `arrive`): on the
// teacher's home the arriving blocks get their 280 ms glide. (3) Nothing glides with Reduce Motion.
//   node scripts/checks/motion-pass-ui.mjs [http://localhost:8787]
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const base = baseUrl();
const fail = [];
const out = [];
/** Counts the glides `arrive` starts (280 ms, a 10 px rise). */
const countGlides = () => {
  window.__glides = 0;
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, opts) {
    if (opts && opts.duration === 280 && Array.isArray(frames) && String(frames[0]?.transform).includes('10px')) window.__glides++;
    return animate.call(this, frames, opts);
  };
};
const browser = await launch();
try {
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('uv-cookies', 'essential'); } catch { /* a locked frame */ } });
    const page = await ctx.newPage();
    await page.goto(base + '/', { waitUntil: 'load', timeout: 240_000 });
    await page.waitForTimeout(3000);
    for (const name of ['Trace', 'UniVersity']) { await page.locator('[role="tab"]', { hasText: name }).first().click(); await page.waitForTimeout(1500); } // warm
    const worst = [];
    for (const name of ['Relief', 'Green', 'Play', 'Trace', 'UniVersity']) {
      await page.evaluate(() => { window.__gaps = []; let last = performance.now(); const f = (t) => { window.__gaps.push(t - last); last = t; if (window.__gaps.length < 70) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      await page.locator('[role="tab"]', { hasText: name }).first().click();
      await page.waitForTimeout(1300);
      worst.push(Math.round(Math.max(...(await page.evaluate(() => window.__gaps.slice(2))))));
    }
    out.push(`landing switches, worst frame each (ms): ${worst.join(', ')}`);
    await ctx.close();
  }
  for (const calm of [false, true]) {
    const ctx = await signedIn(browser, base, 'demo@teacher.com', { width: 1280, height: 900 }, calm ? { reducedMotion: 'reduce' } : {});
    await ctx.addInitScript(countGlides);
    const page = await ctx.newPage();
    await page.goto(base + '/teacher', { waitUntil: 'load', timeout: 240_000 });
    await page.waitForTimeout(5000);
    if (await page.getByText('This page hit a problem').count()) { fail.push('/teacher: the page hit a problem'); await ctx.close(); continue; }
    const glides = await page.evaluate(() => window.__glides);
    out.push(`/teacher${calm ? ' (Reduce Motion)' : ''}: ${glides} glides`);
    if (!calm && glides < 1) fail.push('/teacher: loaded content popped in (no glide)');
    if (calm && glides > 0) fail.push('/teacher: glides with Reduce Motion');
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
