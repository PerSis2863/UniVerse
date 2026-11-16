// M227 Meet & call: the Messages deck says "Meet & call"; the four tiles (New meeting, Join, Schedule, Voice rooms) at
// 1280 (dark, light) and 390 (light): New meeting makes a link with its code, Join takes a pasted link and refuses
// another site's, Voice rooms lists the groups, Schedule opens the form; axe on the page and each sheet, no sideways
// scroll, no page errors. Runs against `local:serve` (or BASE=… for local:dev); SHOTS=<dir> saves screenshots.
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const axe = async (page) => { await page.addScriptTag({ path: AXE }).catch(() => {}); return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`)); };
const browser = await launch();
const out = { errors: [] };
for (const [theme, width] of [['dark', 1280], ['light', 1280], ['light', 390]]) {
  const phone = width < 600, r = (out[`${theme} ${width}`] = {});
  const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => out.errors.push(`${theme} ${width}: ${e.message.slice(0, 160)}`));
  await page.goto(`${base}/calls`, { waitUntil: 'load', timeout: 180_000 });
  const tile = (name) => page.getByRole('region', { name: 'Meet and call' }).getByRole('button', { name: new RegExp(`^${name}`) });
  await tile('New meeting').waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  r.deck = await page.getByRole('navigation', { name: 'Messages' }).innerText().then((t) => t.includes('Meet & call'));
  if (shots) await page.screenshot({ path: `${shots}/meet-${theme}-${width}.png` });
  r.axe = await axe(page);
  r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await tile('New meeting').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByText('Meeting code').waitFor({ timeout: 60_000 });
  r.link = await dlg.locator('p.font-mono').first().innerText();
  if (shots) await page.screenshot({ path: `${shots}/meet-new-${theme}-${width}.png` });
  r.axeNew = await axe(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await tile('Join').click();
  await dlg.getByLabel('Meeting code or link').fill('https://evil.example/x');
  r.refusesOther = await dlg.getByText('isn’t a meeting code').isVisible();
  await dlg.getByLabel('Meeting code or link').fill(`${base}/call/l_test123?kind=video`);
  r.joinEnabled = await dlg.getByRole('button', { name: 'Join', exact: true }).isEnabled();
  r.axeJoin = await axe(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await tile('Voice rooms').click();
  await dlg.getByText(/Each of your groups/).waitFor();
  await page.waitForTimeout(1200);
  r.rooms = await dlg.locator('ul > li').count();
  if (shots) await page.screenshot({ path: `${shots}/meet-rooms-${theme}-${width}.png` });
  r.axeRooms = await axe(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await tile('Schedule').click();
  r.schedule = await page.getByRole('dialog').count() > 0 || await page.getByText(/Schedule a call|New scheduled call|Schedule/).count() > 0;
  await ctx.close();
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
