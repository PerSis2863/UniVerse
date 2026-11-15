// M179 each app's own Messages: a chat started in Relief shows in Relief's Messages and not in
// UniVersity's (and the other way round); "All apps" shows both, each tagged with its app; the same two
// people get one chat per app. Axe at 1280 (dark) and 390 (light, a touch phone), no sideways scroll.
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
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const teacher = await fetch(`${base}/api/core/auth/me`, { headers: H('demo@teacher.com') }).then((r) => r.json());
const start = (app) => fetch(`${base}/api/chat/conversations`, { method: 'POST', headers: H(who), body: JSON.stringify({ userId: teacher.id, app }) }).then((r) => r.json());
const out = {};
const relief = await start('relief'), campus = await start('campus');
out.oneChatPerApp = relief.id && campus.id && relief.id !== campus.id && (await start('relief')).id === relief.id ? 'yes' : `no (${JSON.stringify([relief, campus])})`;
const say = (id, body) => fetch(`${base}/api/chat/conversations/${id}/messages`, { method: 'POST', headers: H(who), body: JSON.stringify({ body }) });
await say(relief.id, 'M179 check: from Relief'); await say(campus.id, 'M179 check: from UniVersity');
const browser = await playwright().chromium.launch();
for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
  const phone = width < 600;
  const r = (out[`${theme} ${width}`] = { axe: [] });
  for (const app of ['relief', 'campus']) {
    const ctx = await signedIn(browser, base, who, { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
    await ctx.addInitScript(([th, a]) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.setItem('uv-last-app', a); localStorage.setItem('uv-chat-all-apps', '0'); }, [theme, app]);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    await page.goto(`${base}/student/inbox`, { waitUntil: 'load', timeout: 180_000 });
    await page.getByRole('heading', { name: /^Chats/ }).first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(wait);
    const list = async () => (await page.locator('section.msg-panel').first().innerText());
    const text = await list();
    r[app] = `${/from Relief/.test(text) ? 'Relief chat' : '—'}, ${/from UniVersity/.test(text) ? 'UniVersity chat' : '—'}`;
    if (app === 'relief') {
      r.axe.push(...(await axe(page)).map((x) => `relief ${x}`));
      r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      await page.getByRole('button', { name: /^All apps/ }).click();
      await page.waitForTimeout(600);
      const all = await list();
      r.allApps = `${/from Relief/.test(all) && /from UniVersity/.test(all) ? 'both' : 'missing one'}, ${/\bRelief\b/.test(all) && /UniVersity/.test(all) ? 'tagged' : 'no tags'}`;
      r.axe.push(...(await axe(page)).map((x) => `all ${x}`));
    }
    r.errors = [...(r.errors ?? []), ...errors];
    await ctx.close();
  }
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
