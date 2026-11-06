// M121 Messages, professional: the panes solid (nothing of the page shows through), "Mark all as
// read" clears every count and it stays after a reload, Alt+↓ / Alt+↑ move between chats, Esc
// closes the open one; on a phone the message box keeps its width and the chat's name shows in
// full. Axe at 1280 and 390, light and dark. Runs against `local:serve` (or BASE=… for local:dev).
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
// Give alice something unread: the demo teacher writes to her (a direct chat), through the API.
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const alice = await fetch(`${base}/api/core/auth/me`, { headers: H(who) }).then((r) => r.json());
const chat = await fetch(`${base}/api/chat/conversations`, { method: 'POST', headers: H('demo@teacher.com'), body: JSON.stringify({ userId: alice.id }) }).then((r) => r.json());
const cid = chat.id ?? chat.conversation?.id;
if (cid) await fetch(`${base}/api/chat/conversations/${cid}/messages`, { method: 'POST', headers: H('demo@teacher.com'), body: JSON.stringify({ body: 'Check for M121: are you free at 4?' }) });
const browser = await playwright().chromium.launch();
const out = {};
for (const [theme, width] of [['dark', 1280], ['light', 1280], ['dark', 390], ['light', 390]]) {
  const phone = width < 600;
  const r = (out[`${theme} ${width}`] = { axe: [] });
  const ctx = await signedIn(browser, base, who, { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  await page.goto(`${base}/student/inbox`, { waitUntil: 'load', timeout: 180_000 });
  await page.getByRole('heading', { name: /^Chats/ }).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(wait);
  // Solid: the list and (on computers) the chat side paint their own colour.
  r.solid = await page.evaluate(() => [...document.querySelectorAll('.msg-panel')].filter((el) => el.getBoundingClientRect().width > 0).map((el) => getComputedStyle(el).backgroundColor).every((c) => !/rgba\(.*, 0(\.\d+)?\)$/.test(c) && c !== 'transparent'));
  r.axe.push(...(await axe(page)).map((x) => `list ${x}`));
  r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (!phone && theme === 'dark') {
    // Mark all as read: the button, every count gone, still gone after a reload.
    const btn = page.getByRole('button', { name: 'Mark all as read' });
    r.markAll = (await btn.count()) ? 'shown' : 'not shown';
    if (await btn.count()) {
      await btn.click(); await page.waitForTimeout(1500);
      await page.reload({ waitUntil: 'load' }); await page.getByRole('heading', { name: /^Chats/ }).first().waitFor({ timeout: 60_000 }); await page.waitForTimeout(wait);
      r.afterReload = (await page.getByRole('button', { name: 'Mark all as read' }).count()) ? 'unread came back' : 'all read';
    }
    // Keys: Alt+↓ opens the first chat, again the next; Esc closes it.
    const url = () => new URL(page.url()).searchParams.get('c');
    await page.getByText('John Doe', { exact: true }).first().waitFor({ timeout: 60_000 });
    await page.keyboard.press('Alt+ArrowDown'); await page.waitForTimeout(wait);
    const first = url();
    await page.keyboard.press('Alt+ArrowDown'); await page.waitForTimeout(wait);
    const second = url();
    await page.getByRole('heading', { name: /^Chats/ }).first().click();
    await page.keyboard.press('Escape'); await page.waitForTimeout(800);
    r.keys = `${first ? 'opened' : 'nothing'} → ${second && second !== first ? 'next' : 'same'} → ${url() ? 'still open' : 'closed'}`;
  }
  if (phone) {
    await page.getByText('John Doe', { exact: true }).first().click();
    await page.getByRole('textbox').last().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(wait);
    r.boxWidth = Math.round((await page.getByRole('textbox').last().boundingBox())?.width ?? 0);
    r.nameShown = await page.evaluate(() => { const el = [...document.querySelectorAll('p')].find((p) => p.textContent?.trim() === 'John Doe'); return el ? el.scrollWidth <= el.clientWidth + 1 : false; });
    r.axe.push(...(await axe(page)).map((x) => `chat ${x}`));
    r.chatWide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  }
  r.errors = errors;
  await ctx.close();
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
