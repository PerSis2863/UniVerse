// M262 Relief's map in the command look (the owner's recording): the needs queue, the map's chips, number cards and
// pinned card, "I can help" as a plan to approve (Now / After, the steps ticking off, Approved), then Undo from the
// toast gives it back. Three needs and an offer are posted near Chennai by one demo account and closed at the end;
// another signs in to help. Axe at 1280 (dark) and 390 (light, a touch phone), no sideways scroll, no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/relief-command-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const call = async (method, path, who, body) => {
  const r = await fetch(`${base}/api/core${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer mock-token-${who}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const ASKER = 'demo@student.com', HELPER = 'alice@student.com', stamp = Date.now() % 100000;
const posts = [];
for (const [i, b] of [
  { type: 'NEED', kind: 'WATER', title: `Drinking water for a family ${stamp}`, urgency: 'CRITICAL', people: 5, details: 'The tap has been dry since yesterday; two small children.' },
  { type: 'NEED', kind: 'FOOD', title: `Hot meals for elderly neighbours ${stamp}`, urgency: 'HIGH', people: 3 },
  { type: 'NEED', kind: 'MEDICAL', title: `Insulin pick-up ${stamp}`, urgency: 'MEDIUM', people: 1 },
  { type: 'OFFER', kind: 'TRANSPORT', title: `I can drive to the shelter ${stamp}`, people: 4 },
].entries()) posts.push((await call('POST', '/relief/posts', ASKER, { ...b, lat: 13.0827 + i * 0.012, lng: 80.2707 + i * 0.01 })).data?.id);
async function axe(page) {
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run({ exclude: [['canvas']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
}
const browser = await launch();
const out = {}, errors = [];
try {
  for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
    const phone = width < 600, r = (out[`${theme} ${width}`] = { axe: [] });
    const ctx = await signedIn(browser, base, HELPER, { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${width}: ${e.message.slice(0, 160)}`));
    await page.goto(`${base}/relief`, { waitUntil: 'load', timeout: 180_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const queue = page.getByRole('region', { name: 'Needs you' });
    const card = queue.locator('article').filter({ hasText: `Drinking water for a family ${stamp}` });
    await card.waitFor({ timeout: 90_000 });
    r.chips = await page.getByRole('radiogroup', { name: 'Show' }).innerText().then((t) => t.replace(/\s+/g, ' '));
    r.stats = await page.locator('.cmd-relief .grid > div').filter({ hasText: /Open needs|Being helped|Urgent|Helped/ }).allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, ' ')).slice(0, 4));
    r.card = (await card.innerText()).replace(/\s+/g, ' ');
    if (shots) await page.screenshot({ path: `${shots}/relief-command-${width}.png` });
    r.axe.push(...(await axe(page)).map((x) => `map ${x}`));
    r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    // Show it on the map: the pinned card and the side card.
    await card.getByRole('button', { name: 'Show on map' }).click();
    await page.waitForTimeout(1500);
    r.pinned = await page.locator('.cmd-relief .will-change-transform').first().innerText().then((t) => t.replace(/\s+/g, ' ')).catch(() => 'none');
    if (shots) await page.screenshot({ path: `${shots}/relief-chosen-${width}.png` });
    r.axe.push(...(await axe(page)).map((x) => `chosen ${x}`));
    // I can help: the plan, approved, the steps tick off, Approved; then Undo gives it back.
    await card.getByRole('button', { name: 'I can help' }).click();
    const sheet = page.getByRole('dialog', { name: `Drinking water for a family ${stamp}` });
    await sheet.waitFor({ timeout: 10_000 });
    r.changes = await sheet.locator('tbody tr').allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, ' ')));
    if (shots) await page.screenshot({ path: `${shots}/relief-plan-${width}.png` });
    r.axe.push(...(await axe(page)).map((x) => `plan ${x}`));
    await sheet.getByRole('button', { name: 'I can help' }).click();
    await sheet.getByRole('button', { name: 'Approved' }).waitFor({ timeout: 15_000 });
    r.steps = await sheet.locator('ol li').allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, ' ')));
    if (shots) await page.screenshot({ path: `${shots}/relief-approved-${width}.png` });
    const taken = await call('GET', '/relief/map', HELPER);
    r.taken = taken.data?.posts?.find((p) => p.id === posts[0])?.status;
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(1500);
    r.afterUndo = (await call('GET', '/relief/map', HELPER)).data?.posts?.find((p) => p.id === posts[0])?.status;
    await ctx.close();
  }
} finally {
  for (const id of posts) if (id) await call('POST', `/relief/posts/${id}/close`, ASKER);
  await browser.close();
}
out.errors = errors;
console.log(JSON.stringify(out, null, 2));
