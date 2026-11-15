// M197 the apps the website shows (owner console → Server → Apps on the website). The list's answer
// (GET /api/core/site/apps) is played by the browser here, so each case runs without changing the
// database: one app (Relief): no app tabs on the website or sign-in, no planet or app grid, the hub and
// another app's pages send people into Relief, no "All apps" in the menu, no switcher list, no
// This app / All apps in Messages; two apps (UniVersity and Green): two tabs, two cards on the hub, Trace
// sends people home, Messages' switch back; the list given in the page's head (as the Worker does) hides
// the other apps' parts before the page is drawn. Axe at 1280 (dark) and 390 (light), no sideways scroll.
// Runs against `local:serve` (or BASE=… for local:dev).
import { createRequire } from 'node:module';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', who = 'alice@student.com', wait = Number(process.env.WAIT ?? 2500);
async function axe(page) {
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const out = {};
out.route = await fetch(`${base}/api/core/site/apps`).then((r) => r.json()).then((d) => (Array.isArray(d.apps) && d.apps.length ? `answers ${d.apps.join(', ')}` : `odd: ${JSON.stringify(d)}`));
const browser = await playwright().chromium.launch();
const prep = async (ctx, apps, theme) => {
  await ctx.route('**/api/core/site/apps', (r) => r.fulfill({ json: { apps } }));
  await ctx.addInitScript(([th, list]) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.setItem('uv-apps', JSON.stringify(list)); }, [theme, apps]);
};
const visible = (page, sel) => page.locator(sel).filter({ visible: true }).count();
const settle = async (page, path) => { await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 180_000 }); await page.waitForTimeout(wait); };

for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
  const phone = width < 600, size = { width, height: phone ? 844 : 900 }, touch = phone ? { isMobile: true, hasTouch: true } : {};
  const r = (out[`${theme} ${width}`] = { axe: [], errors: [] });
  const watch = (page) => page.on('pageerror', (e) => r.errors.push(e.message.slice(0, 160)));

  // One app: Relief.
  let ctx = await browser.newContext({ viewport: size, ...touch });
  await prep(ctx, ['relief'], theme);
  let page = await ctx.newPage(); watch(page);
  await settle(page, '/');
  r.oneLanding = `${await visible(page, '[role=tablist]')} tab rows, app ${await page.evaluate(() => document.documentElement.dataset.app)}, planet ${await visible(page, '#world-h')}, grid ${await visible(page, '#apps')}`;
  r.axe.push(...(await axe(page)).map((x) => `landing ${x}`));
  r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await settle(page, '/login');
  r.oneLogin = `${await visible(page, '[role=tablist]')} tab rows`;
  await ctx.close();

  ctx = await signedIn(browser, base, who, size, touch);
  await prep(ctx, ['relief'], theme);
  page = await ctx.newPage(); watch(page);
  await settle(page, '/hub');
  await page.waitForURL(/\/relief/, { timeout: 30_000 }).catch(() => {});
  r.oneHub = new URL(page.url()).pathname;
  await settle(page, '/student/courses');
  await page.waitForURL(/\/relief/, { timeout: 30_000 }).catch(() => {});
  r.oneHidden = new URL(page.url()).pathname;
  if (phone) { await page.getByRole('button', { name: /menu/i }).first().click().catch(() => {}); await page.waitForTimeout(500); }
  r.oneMenu = `All apps ${await visible(page, 'aside a[href="/hub"], nav a[href="/hub"]')}, switcher list ${await page.locator('.side-switch[aria-haspopup]').count()}`;
  r.axe.push(...(await axe(page)).map((x) => `relief ${x}`));
  await settle(page, '/student/inbox');
  r.oneMessages = `${await page.getByRole('group', { name: 'Which chats' }).count()} app switches`;
  await ctx.close();

  // Two apps: UniVersity and Green.
  ctx = await signedIn(browser, base, who, size, touch);
  await prep(ctx, ['campus', 'green'], theme);
  page = await ctx.newPage(); watch(page);
  await settle(page, '/hub');
  r.twoHub = `${await page.locator('#apps-h + div a').count()} app cards, at ${new URL(page.url()).pathname}`;
  r.axe.push(...(await axe(page)).map((x) => `hub ${x}`));
  await settle(page, '/trace');
  await page.waitForURL((u) => !u.pathname.startsWith('/trace'), { timeout: 30_000 }).catch(() => {});
  r.twoHidden = new URL(page.url()).pathname;
  await settle(page, '/student/inbox');
  r.twoMessages = `${await page.getByRole('group', { name: 'Which chats' }).count()} app switch`;
  await ctx.close();
  ctx = await browser.newContext({ viewport: size, ...touch });
  await prep(ctx, ['campus', 'green'], theme);
  page = await ctx.newPage(); watch(page);
  await settle(page, '/');
  r.twoLanding = `${await page.locator('[role=tablist] [role=tab]').filter({ visible: true }).count()} tabs`;
  await ctx.close();

  // The list given in the head (the Worker's way): hidden before the page is drawn.
  ctx = await browser.newContext({ viewport: size, ...touch });
  await ctx.route('**/api/core/site/apps', (rt) => rt.fulfill({ json: { apps: ['green'] } }));
  await ctx.addInitScript(() => { window.__uvApps = ['green']; });
  page = await ctx.newPage(); watch(page);
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  r.headStyle = await page.evaluate(() => `${document.getElementById('uv-apps-css')?.textContent ?? 'none'}, app ${document.documentElement.dataset.app}`);
  await ctx.close();
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
