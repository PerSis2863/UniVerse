// M116 in the browser (`pnpm local:serve` or the dev server): the first impression.
//  - Landing, UniVersity tab: the bigger headline (96 px from 1280, read with its spaces), the picture of the student home
//    under it (a phone below 768 px, the window above; flat once scrolled to), gone on another app's tab.
//  - Sign in and sign up on a phone: nothing runs past the screen's edge (the form was cut off: its
//    column took the app tabs' full width, hidden by overflow-x-clip, so "no sideways scrolling" missed it).
//  - No glass (§8): the form cards, the top bar once scrolled and the app tabs have no backdrop-filter
//    and a solid fill; the logo reads "UniVerse Impact" (no old tagline).
//  - Axe (serious/critical) and no sideways scrolling at 390 and 1280, light and dark.
//   node scripts/checks/first-impression-ui.mjs [http://localhost:8787]
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:8787';
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };
async function axe(page, what) {
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  for (const b of bad) fail.push(`${what} axe ${b}`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${what}: sideways scrolling`);
}
/** Laid-out boxes past the screen's right edge (not fixed, not inside a scroller, decoration or a
 *  picture, and not still invisible: a section's parts wait off to the side until scrolled to). */
const pastEdge = (page) => page.evaluate(() => {
  const w = innerWidth;
  return [...document.body.querySelectorAll('*')].filter((e) => {
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.right > w + 2) || e.closest('[class*="overflow-x-auto"], [aria-hidden="true"], canvas, nextjs-portal')) return false;
    // Inside a picture (role="img"), parts turn and orbit: only the picture's own box counts.
    const pic = e.closest('[role="img"]');
    if (pic && pic !== e) return false;
    for (let a = e; a; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.position === 'fixed' || cs.opacity === '0') return false; }
    return true;
  }).filter((e, _, all) => !all.some((o) => o !== e && e.contains(o))).slice(0, 3)
    .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 48)} (right ${Math.round(e.getBoundingClientRect().right)})`);
});
/** The fill and backdrop of the closest ancestor (or self) matching a selector. */
const look = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { blur: cs.backdropFilter && cs.backdropFilter !== 'none', alpha: Number((cs.backgroundColor.match(/rgba?\(([^)]+)\)/)?.[1].split(',')[3] ?? '1').trim()) };
}, sel);

const browser = await launch();
try {
  for (const scheme of ['dark', 'light']) for (const width of [390, 1280]) {
    const tag = `${scheme} ${width}`;
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
    await ctx.addInitScript(() => { try { localStorage.setItem('uv-cookies', 'essential'); } catch { /* storage off */ } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

    // ── Landing, UniVersity ──
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 180_000 });
    const pic = page.locator('[role="img"][aria-label*="student home"]');
    await pic.waitFor({ state: 'attached', timeout: 90_000 });
    await page.waitForTimeout(1500);
    const h1 = await page.locator('h1').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    check(width >= 1280 ? h1 >= 96 : h1 >= 52, `${tag}: headline ${h1}px`);
    // Real spaces between the words (they were margins: read as "Theschooldayrunsitself.").
    const words = (await page.locator('h1').first().innerText()).replace(/\s+/g, ' ').trim();
    check(words === 'The school day runs itself.', `${tag}: the headline reads "${words}"`);
    check(await page.getByRole('tablist', { name: 'Choose an app' }).evaluate((e) => getComputedStyle(e).backdropFilter === 'none'), `${tag}: the app tabs are glass`);
    // The phone below 768 px, the window above; flat once scrolled to.
    const shown = await pic.evaluate((e) => [...e.children].map((c) => getComputedStyle(c).display !== 'none'));
    check(width < 768 ? shown[0] === false && shown[1] === true : shown[0] === true && shown[1] === false, `${tag}: the ${width < 768 ? 'phone' : 'window'} should show (${shown})`);
    await pic.evaluate((e) => window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 100));
    await page.waitForTimeout(1800);
    const tilt = await pic.evaluate((e) => { let a = e; while (a && !a.style?.transform) a = a.parentElement; const m = a?.style.transform.match(/rotateX\(([-\d.]+)deg\)/); return m ? Math.abs(parseFloat(m[1])) : 0; });
    check(tilt < 2, `${tag}: the picture is still tilted ${tilt}° when scrolled to`);
    const nav = await look(page, 'header nav');
    check(nav && !nav.blur && nav.alpha === 1, `${tag}: the top bar once scrolled is glass (${JSON.stringify(nav)})`);
    await axe(page, `${tag} landing`);
    const wideLanding = await pastEdge(page);
    check(!wideLanding.length, `${tag} landing: past the right edge: ${wideLanding.join(' ; ')}`);
    // Another app's tab: no UniVersity picture.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('tab', { name: /Trace/ }).click();
    await page.waitForTimeout(900);
    check(await pic.count() === 0, `${tag}: the student home still shows on Trace's tab`);
    await page.getByRole('tab', { name: /UniVersity/ }).click();

    // ── Sign in and sign up ──
    for (const path of ['/login?app=campus', '/register?app=campus']) {
      await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 180_000 });
      await page.locator('.rounded-3xl.border').first().waitFor({ timeout: 90_000 });
      await page.waitForTimeout(1200);
      const wideForm = await pastEdge(page);
      check(!wideForm.length, `${tag} ${path}: past the screen's edge: ${wideForm.join(' ; ')}`);
      const card = await look(page, '.rounded-3xl.border');
      check(card && !card.blur && card.alpha === 1, `${tag} ${path}: the form card is glass (${JSON.stringify(card)})`);
      const brand = await page.evaluate(() => [...document.querySelectorAll('span')].some((e) => e.textContent.trim() === 'UniVerse Impact' && e.checkVisibility()));
      check(brand, `${tag} ${path}: the logo doesn't read UniVerse Impact`);
      check(await page.getByText('Global Universities & NGO Network').count() === 0, `${tag} ${path}: the old tagline is back`);
      await axe(page, `${tag} ${path}`);
    }
    check(!errors.length, `${tag}: page errors ${errors.join(' | ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(fail.length ? `✗ ${fail.length} problems\n${fail.join('\n')}` : '✓ First impression: the bigger headline, the student home under it (phone and window, flat when reached, gone on other tabs), sign-in and sign-up fit a phone, no glass, UniVerse Impact; axe at 390 and 1280, light and dark');
process.exit(fail.length ? 1 : 0);
