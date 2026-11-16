// M205 UniVerse Travel's "Find where to go": the form (days, budget and currency, month, interests,
// passport) ranks every place with its reasons, cards slide when a choice changes, a passport's visa
// rules come in (Wikipedia), more places on demand, and the guide's Know tab names the visa. Axe at 1280
// (dark) and 390 (light, a touch phone), no sideways scroll, no page errors. Needs the internet.
// Runs against `local:serve` (or BASE=… for local:dev).
import { createRequire } from 'node:module';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', who = 'alice@student.com', shots = process.env.SHOTS;
async function axe(page) {
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const browser = await playwright().chromium.launch();
const out = {};
for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
  const phone = width < 600;
  const r = (out[`${theme} ${width}`] = { axe: [] });
  const ctx = await signedIn(browser, base, who, { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.setItem('uv-travel-home', 'GB'); }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const first = () => page.locator('ol[aria-live] > li').first().locator('a span.text-lg').innerText();
  await page.goto(`${base}/travel`, { waitUntil: 'load', timeout: 180_000 });
  await page.goto(`${base}/travel?view=find`, { waitUntil: 'load', timeout: 180_000 }); // M218: a side-menu entry
  await page.getByRole('group', { name: 'What you love' }).waitFor({ timeout: 90_000 });
  r.url = new URL(page.url()).search;
  await page.getByLabel('Month').selectOption({ label: 'November' });
  await page.getByRole('combobox', { name: 'Currency' }).selectOption('EUR');
  await page.waitForTimeout(400);
  r.cards = await page.locator('ol[aria-live] > li').count();
  r.top = await first();
  r.reasons = (await page.locator('ol[aria-live] > li').first().locator('li').allInnerTexts()).map((t) => t.replace(/^(Good|Watch out): /, ''));
  // The visas came in for a British passport.
  r.visa = await page.getByText(/No visa needed|eVisa online|Online travel permit/).first().waitFor({ timeout: 40_000 }).then(() => 'shown', () => 'missing');
  // Change what they love: the order changes.
  await page.getByRole('button', { name: 'Beaches' }).click();
  await page.getByRole('button', { name: 'Street food' }).click();
  await page.getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Walkable' }).click();
  await page.getByLabel('Month').selectOption({ label: 'July' });
  await page.waitForTimeout(600);
  r.beachTop = await first();
  await page.getByRole('button', { name: 'Show more places' }).click();
  r.more = await page.locator('ol[aria-live] > li').count();
  if (shots) await page.screenshot({ path: `${shots}/travel-find-${width}.png` });
  r.axe.push(...(await axe(page)).map((x) => `find ${x}`));
  r.wide = await wide();
  if (!phone) {
    await page.goto(`${base}/travel/guide?d=Kyoto`, { waitUntil: 'load', timeout: 180_000 });
    await page.getByRole('tab', { name: /Know before you go/ }).click();
    r.knowVisa = await page.getByText(/Your passport:/).first().waitFor({ timeout: 40_000 }).then(() => page.getByText(/Your passport:/).first().innerText(), () => 'missing');
    r.axe.push(...(await axe(page)).map((x) => `know ${x}`));
  }
  r.errors = errors;
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 2));
