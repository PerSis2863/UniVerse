// M43 in the browser (dev server with demo login, or `pnpm local:serve`): the landing's Relief, Green
// and Play tabs with their "try it here" demos (help map, log an action, a quiz round), and photos
// shared into UniVerse (the share route's fallback, then photos waiting in the device cache reaching
// a chat's box). Axe at 390/1280 (the landing is dark only; the share bar light and dark).
//   node scripts/checks/landing-try-ui.mjs [http://localhost:3100]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };

/** Picks a landing tab, again until it takes (the first tap can land before the page is ready). */
async function tab(page, name, section) {
  for (let i = 0; i < 10 && !(await page.locator(section).count()); i++) {
    await page.getByRole('tab', { name }).first().click();
    await page.waitForTimeout(1000);
  }
  await page.locator(section).scrollIntoViewIfNeeded();
}

async function axe(page, what) {
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  for (const b of bad) fail.push(`${what} axe ${b}`);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!wide, `${what}: sideways scrolling`);
}

const browser = await launch();
try {
  // ── The landing's tabs ──
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 180_000 });

    await tab(page, /Play/, '#play-try');
    for (let i = 0; i < 5; i++) {
      await page.locator('#play-try button:not([disabled])').first().click({ timeout: 20_000 });
      await page.waitForTimeout(1300);
    }
    check(await page.getByRole('button', { name: 'Play again' }).isVisible(), `play ${width}: round ends`);
    await page.locator('#play-worlds').scrollIntoViewIfNeeded();
    check((await page.locator('#play-worlds h3').count()) === 4, `play ${width}: four worlds`);
    await page.waitForTimeout(600);
    await axe(page, `play ${width}`);

    await tab(page, /Green/, '#green-try');
    await page.getByRole('button', { name: 'Solar', exact: true }).click();
    await page.getByRole('button', { name: /^More/ }).click();
    await page.getByRole('button', { name: 'Log it' }).click();
    const saved = await page.locator('#green-try').innerText();
    check(/12 kg/.test(saved), `green ${width}: 30 kWh of solar saves 12 kg (${saved.replace(/\s+/g, ' ').slice(0, 120)})`);
    await page.locator('#green-proof').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await axe(page, `green ${width}`);

    await tab(page, /Relief/, '#relief-try');
    await page.getByRole('button', { name: /^Offer help/ }).click();
    await page.waitForTimeout(400);
    check((await page.locator('#relief-try').getByText('on the way').count()) === 1, `relief ${width}: help on the way`);
    check(await page.locator('#relief-try canvas').isVisible(), `relief ${width}: map drawn`);
    await page.locator('#relief-safe').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await axe(page, `relief ${width}`);
    check(!errors.length, `landing ${width}: page errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  // ── Sharing into UniVerse ──
  const form = new FormData();
  form.set('title', 'Flood map');
  form.set('url', 'https://example.org/map');
  const r = await fetch(base + '/api/share-in', { method: 'POST', body: form, redirect: 'manual' });
  check(r.status === 303 && r.headers.get('location') === '/app?title=Flood+map&url=https%3A%2F%2Fexample.org%2Fmap', `share fallback: ${r.status} ${r.headers.get('location')}`);

  for (const scheme of ['light', 'dark']) {
    for (const width of [390, 1280]) {
      const ctx = await signedIn(browser, base, 'demo@student.com', { width, height: 860 }, { colorScheme: scheme });
      await ctx.addInitScript((s) => localStorage.setItem('theme', s), scheme);
      const page = await ctx.newPage();
      await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
      // What the service worker leaves behind: two photos in the device cache.
      await page.evaluate(async () => {
        const c = await caches.open('universe-share');
        const png = await (await fetch('/icon-192x192.png')).blob();
        for (const i of [0, 1]) await c.put(`/__share/${i}`, new Response(png, { headers: { 'content-type': 'image/png', 'x-name': `photo-${i + 1}.png` } }));
      });
      await page.goto(base + '/app?photos=2', { waitUntil: 'domcontentloaded' });
      await page.waitForURL(/inbox|messages|chat/, { timeout: 120_000 });
      const banner = page.getByText('Pick a chat to send 2 photos to');
      await banner.waitFor({ timeout: 60_000 });
      await page.locator('.stagger > div.group > button').first().click();
      const bar = page.getByRole('region', { name: 'Shared photos' });
      await bar.waitFor({ timeout: 60_000 });
      check((await bar.locator('img').count()) === 2, `share ${scheme} ${width}: two photos above the box`);
      await axe(page, `share bar ${scheme} ${width}`);
      await bar.getByRole('button', { name: 'Not now' }).click();
      check(!(await page.evaluate(() => caches.has('universe-share'))), `share ${scheme} ${width}: "Not now" forgets them`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

if (fail.length) { console.log(`FAILED (${fail.length}):\n- ${fail.join('\n- ')}`); process.exit(1); }
console.log('landing-try-ui: all good');
