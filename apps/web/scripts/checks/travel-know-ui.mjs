// M204 a guide's "Know before you go" (Kyoto) and its Eat tab (Kyoto/Central); from Wikivoyage, needs the internet:
// plugs and voltage against a chosen home country (Britain: an adapter and a voltage warning), when to
// go from the climate table, why it's famous, the tips (Japan's where Kyoto's guide is silent, marked),
// neighbourhoods with their feel; Eat: what to try, price-band and diet chips that narrow the list, Book a
// table. Axe at 1280 (dark) and 390 (light, a touch phone), no sideways scroll, no page errors.
// Runs against `local:serve` (or BASE=… for local:dev).
import { createRequire } from 'node:module';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', who = 'alice@student.com';
async function axe(page) {
  await page.waitForTimeout(500);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const out = {};
const browser = await playwright().chromium.launch();
for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
  const phone = width < 600;
  const r = (out[`${theme} ${width}`] = { axe: [], errors: [] });
  const ctx = await signedIn(browser, base, who, { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.setItem('uv-last-app', 'travel'); localStorage.removeItem('uv-travel-home'); }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => r.errors.push(e.message.slice(0, 160)));
  await page.goto(`${base}/travel/guide?d=Kyoto`, { waitUntil: 'load', timeout: 180_000 });
  await page.getByRole('tab', { name: /Know before you go/ }).waitFor({ timeout: 120_000 });
  await page.getByRole('tab', { name: /Know before you go/ }).click();
  await page.getByRole('heading', { name: 'Plugs and power' }).waitFor({ timeout: 30_000 });
  await page.getByLabel('Where you live').selectOption('GB');
  await page.waitForTimeout(300);
  const know = await page.getByRole('tabpanel').innerText();
  r.power = `${/Type A/.test(know) && /Type B/.test(know) ? 'A and B' : 'plugs missing'}, ${/100 V/.test(know) ? '100 V' : 'no volts'}, ${/Bring an adapter/.test(know) ? 'adapter' : 'no adapter line'}, ${/check your charger/.test(know) ? 'voltage warning' : 'no voltage line'}, ${/drive on the left, as at home/.test(know) ? 'left as at home' : 'drive line?'}`;
  r.climate = /Pleasant for walking: /.test(know) ? 'months named' : 'no months';
  r.stories = `${await page.locator('#know-stories ~ ol li').count()} stories`;
  r.tips = `${await page.locator('#know-tips ~ ul > li').count()} topics, ${/Tipping/.test(know) ? 'tipping' : 'no tipping'}, ${(await page.locator('#know-tips ~ ul > li span[translate=no]').count()) > 0 ? 'country marked' : 'none marked'}`;
  r.areas = `${await page.locator('#know-areas ~ ul > li').count()} neighbourhoods`;
  r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  r.axe.push(...(await axe(page)).map((x) => `know ${x}`));

  // Kyoto lists its restaurants in its districts' guides.
  await page.goto(`${base}/travel/guide?d=${encodeURIComponent('Kyoto/Central')}`, { waitUntil: 'load', timeout: 180_000 });
  await page.getByRole('tab', { name: /^Eat/ }).waitFor({ timeout: 120_000 });
  await page.getByRole('tab', { name: /^Eat/ }).click();
  await page.waitForTimeout(600);
  const count = async () => Number((await page.locator('[role=tabpanel] p[aria-live]').innerText()).match(/\d+/)?.[0] ?? -1);
  const all = await count();
  r.dishes = (await page.getByRole('heading', { name: 'What to try' }).count()) ? 'what to try' : 'no dishes card';
  const chips = page.getByRole('group', { name: 'Narrow these places' }).getByRole('button');
  r.chips = (await chips.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(', ');
  if (await chips.count()) {
    await chips.first().click();
    await page.waitForTimeout(300);
    r.narrowed = `${all} → ${await count()}`;
    await chips.first().click();
  }
  r.table = `${await page.getByRole('link', { name: 'Book a table' }).count()} Book a table links`;
  r.axe.push(...(await axe(page)).map((x) => `eat ${x}`));
  await ctx.close();
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
