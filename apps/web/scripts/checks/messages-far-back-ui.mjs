// M192 Messages, far back: in a chat of 3,000 messages (made here as SQL, removed after), searching
// the very first one opens it (a stretch of old messages around it), "Load newer messages" pages
// forward, and the arrow button goes back to the newest. Axe at 1280 dark and light. Runs against
// `local:serve` (or BASE=http://localhost:3000 for local:dev).
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', who = 'alice@student.com', wait = Number(process.env.WAIT ?? 2500);
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const sql = (file) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'universe-db', '--local', '--file', file], { stdio: 'pipe' });
const me = (e) => fetch(`${base}/api/core/auth/me`, { headers: H(e) }).then((r) => r.json());
const [alice, bob] = await Promise.all([me(who), me('bob@student.com')]);
const chat = await fetch(`${base}/api/chat/conversations`, { method: 'POST', headers: H(who), body: JSON.stringify({ userId: bob.id }) }).then((r) => r.json());
const cid = chat.id ?? chat.conversation?.id;
const rows = Array.from({ length: 3000 }, (_, i) => `('m192c${String(i).padStart(5, '0')}','${cid}','${i % 2 ? alice.id : bob.id}','${i ? `Far back check ${i}` : 'The very first zebra message'}','TEXT','${new Date(Date.UTC(2026, 4, 1, 9) + i * 3_600_000).toISOString().replace('Z', '+00:00')}')`);
const file = join(tmpdir(), 'm192-check.sql');
writeFileSync(file, Array.from({ length: 15 }, (_, k) => `INSERT INTO messages (id, conversationId, senderId, body, type, createdAt) VALUES ${rows.slice(k * 200, k * 200 + 200).join(',')};`).join('\n'));
sql(file);
async function axe(page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const browser = await playwright().chromium.launch();
const out = {};
try {
  for (const theme of ['dark', 'light']) {
    const r = (out[theme] = {});
    const ctx = await signedIn(browser, base, who, { width: 1280, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    await page.goto(`${base}/student/inbox?c=${cid}`, { waitUntil: 'load', timeout: 180_000 });
    await page.getByText('Far back check 2999').first().waitFor({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Search in chat' }).click();
    await page.getByPlaceholder('Search messages and files, press Enter').fill('zebra');
    await page.keyboard.press('Enter');
    await page.getByText('The very first zebra message').first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(wait);
    r.opened = await page.getByText('The very first zebra message').first().isVisible();
    r.newestHidden = (await page.locator('#msg-m192c02999').count()) === 0;
    r.axe = await axe(page);
    await page.getByRole('button', { name: 'Load newer messages' }).click();
    await page.getByText('Far back check 60', { exact: true }).waitFor({ timeout: 30_000 });
    r.loadNewer = 'ok';
    await page.getByRole('button', { name: 'Go to the newest message' }).click();
    await page.getByText('Far back check 2999').first().waitFor({ timeout: 30_000 });
    r.backToLatest = 'ok';
    r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    r.errors = errors;
    await ctx.close();
  }
} finally {
  await browser.close();
  writeFileSync(file, `DELETE FROM messages WHERE id LIKE 'm192c%';`);
  sql(file);
}
console.log(JSON.stringify(out, null, 1));
