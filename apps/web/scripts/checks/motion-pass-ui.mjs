// M130 (built Worker): the motion pass. (1) The landing's app switch: the page's own frames through
// each switch (the hero's picture and the rest follow in a render React can pause, so no long frame).
// (2) Content replacing a loading placeholder glides in (src/lib/scroll-motion.ts `arrive`): on the
// teacher's home the arriving blocks get their 280 ms glide. (3) Nothing glides with Reduce Motion.
// M133: (4) scrolling the whole landing timed, its scroll-tied parts on scroll timelines; (5) the app's
// page switches timed.
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
    // M133: scrolling the whole landing with a wheel; the scroll-tied parts run on scroll timelines.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    await page.evaluate(() => { window.__gaps = []; let last = performance.now(); const f = (t) => { window.__gaps.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 180); await page.waitForTimeout(40); }
    await page.evaluate(() => { window.__stop = true; });
    const gaps = await page.evaluate(() => window.__gaps.slice(2));
    const slow = gaps.filter((g) => g > 34).length;
    out.push(`landing scroll: worst frame ${Math.round(Math.max(...gaps))} ms, ${slow} of ${gaps.length} frames over 34 ms`);
    const tied = await page.evaluate(() => [...document.querySelectorAll('.scrub, .scroll-progress, .hero-drift')].map((el) => el.getAnimations().some((a) => a.timeline && !(a.timeline instanceof DocumentTimeline))));
    if (tied.length && !tied.every(Boolean)) fail.push(`landing: ${tied.filter((x) => !x).length} scroll-tied parts without a scroll timeline`);
    out.push(`landing: ${tied.filter(Boolean).length} parts tied to the scroll`);
    await ctx.close();
  }
  {
    // M133: switching pages in the app (the page's frames through each change).
    const ctx = await signedIn(browser, base, 'demo@student.com', { width: 1280, height: 900 });
    const page = await ctx.newPage();
    await page.goto(base + '/student', { waitUntil: 'load', timeout: 240_000 });
    await page.waitForTimeout(4000);
    const worst = [];
    for (const path of ['/student/courses', '/student', '/student/courses', '/student']) {
      await page.evaluate(() => { window.__gaps = []; let last = performance.now(); const f = (t) => { window.__gaps.push(t - last); last = t; if (window.__gaps.length < 90) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      await page.locator(`a[href="${path}"]:visible`).first().click();
      await page.waitForTimeout(1600);
      worst.push(Math.round(Math.max(...(await page.evaluate(() => (window.__gaps ?? [0]).slice(2))))));
    }
    out.push(`app page switches, worst frame each (ms): ${worst.join(', ')}`);
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
