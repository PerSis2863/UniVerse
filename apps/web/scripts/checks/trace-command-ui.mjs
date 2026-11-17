// M263 Trace's tracking map in the command look (the owner's recording), in "Explore with sample data" (no brand
// needed): the chips with counts, number cards, "Needs you" (the shipment that ran warm), choosing it (the card pinned
// to the truck), the At risk chip. Axe at 1280 (dark) and 390 (light, a touch phone), no sideways scroll, no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/trace-command-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
async function axe(page) {
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run({ exclude: [['canvas']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
}
const browser = await launch();
const out = {}, errors = [];
for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
  const phone = width < 600, r = (out[`${theme} ${width}`] = { axe: [] });
  const ctx = await signedIn(browser, base, 'demo@student.com', { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); sessionStorage.setItem('universe:sample-mode', '1'); }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${width}: ${e.message.slice(0, 160)}`));
  await page.goto(`${base}/trace/tracking`, { waitUntil: 'load', timeout: 180_000 });
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  const chips = page.getByRole('radiogroup', { name: 'Show' });
  await chips.waitFor({ timeout: 90_000 });
  await page.waitForTimeout(2500);
  r.chips = (await chips.innerText()).replace(/\s+/g, ' ');
  r.stats = await page.locator('.cmd-trace .cmd-pop').filter({ hasText: /On the move|Delivered|At risk|Next arrival/ }).allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, ' ')).slice(0, 4));
  const needs = page.getByRole('region', { name: 'Shipments' }).locator('article');
  r.needs = await needs.allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, ' ').slice(0, 140)));
  if (shots) await page.screenshot({ path: `${shots}/trace-command-${width}.png` });
  r.axe.push(...(await axe(page)).map((x) => `map ${x}`));
  r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (await needs.count()) {
    await needs.first().getByRole('button', { name: /Show it|Show on map/ }).first().click();
    await page.waitForTimeout(2000);
    r.pinned = await page.locator('.cmd-trace .will-change-transform').first().innerText().then((t) => t.replace(/\s+/g, ' ')).catch(() => 'none');
    if (shots) await page.screenshot({ path: `${shots}/trace-chosen-${width}.png` });
    r.axe.push(...(await axe(page)).map((x) => `chosen ${x}`));
  }
  await chips.getByRole('radio', { name: /At risk/ }).click();
  r.riskChip = await chips.getByRole('radio', { name: /At risk/ }).getAttribute('aria-checked');
  await ctx.close();
}
out.errors = errors;
await browser.close();
console.log(JSON.stringify(out, null, 2));
