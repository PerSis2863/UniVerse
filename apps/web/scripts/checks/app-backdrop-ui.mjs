// M129 (dev server or built Worker): each app's own scene behind the page. The landing page has one
// background canvas and changes scene with every app tab (the page's own frames timed through each
// switch: the scene is drawn on a background thread, so the page keeps its pace); sign-in shows the
// chosen app's scene; pages inside the apps have one too (Trace's and the student home). Axe on the
// landing at 390 and 1280, light and dark.
//   node scripts/checks/app-backdrop-ui.mjs [http://localhost:8787]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const fail = [];
const out = [];
const canvases = (page) => page.$$eval('canvas.app-backdrop', (c) => c.length);
const browser = await launch();
try {
  for (const width of [1280, 390]) {
    for (const scheme of ['dark', 'light']) {
      const what = `/ ${width} ${scheme}`;
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, ...(width < 600 ? { isMobile: true, hasTouch: true } : {}) });
      await ctx.addInitScript(() => { try { localStorage.setItem('uv-cookies', 'essential'); } catch { /* a locked frame */ } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base + '/', { waitUntil: 'load', timeout: 240_000 });
      await page.waitForTimeout(2500);
      if ((await canvases(page)) !== 1) fail.push(`${what}: ${await canvases(page)} background canvases (want 1)`);
      if (width === 1280 && scheme === 'dark') {
        // Through every tab: the page's own frames during each 1 s switch.
        let worst = 0;
        for (const name of ['Trace', 'Relief', 'Green', 'Play', 'UniVersity']) {
          await page.evaluate(() => { window.__gaps = []; let last = performance.now(); const f = (t) => { window.__gaps.push(t - last); last = t; if (window.__gaps.length < 70) requestAnimationFrame(f); }; requestAnimationFrame(f); });
          await page.locator('[role="tab"]', { hasText: name }).first().click();
          await page.waitForTimeout(1300);
          const gaps = await page.evaluate(() => window.__gaps.slice(2));
          worst = Math.max(worst, ...gaps);
        }
        out.push(`${what}: worst frame during the switches ${Math.round(worst)} ms`);
      }
      await page.addScriptTag({ path: AXE });
      const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
      for (const b of bad) fail.push(`${what} axe ${b}`);
      for (const e of errors) fail.push(`${what}: ${e}`);
      await ctx.close();
    }
  }
  // Sign-in, with the app picked on the website.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base + '/login?app=green', { waitUntil: 'load', timeout: 240_000 });
    await page.waitForTimeout(2000);
    if ((await canvases(page)) !== 1) fail.push(`/login: ${await canvases(page)} background canvases (want 1)`);
    out.push('/login?app=green');
    await ctx.close();
  }
  // Inside the apps.
  for (const path of ['/student', '/trace']) {
    const ctx = await signedIn(browser, base, 'demo@student.com');
    const page = await ctx.newPage();
    await page.goto(base + path, { waitUntil: 'load', timeout: 240_000 });
    await page.waitForTimeout(3000);
    if (await page.getByText('This page hit a problem').count()) fail.push(`${path}: the page hit a problem`);
    if ((await canvases(page)) !== 1) fail.push(`${path}: ${await canvases(page)} background canvases (want 1)`);
    out.push(path);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
