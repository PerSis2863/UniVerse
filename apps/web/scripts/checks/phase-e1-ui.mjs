// Phase E, first batch, in the browser on the built Worker (pnpm local:serve --test-secret):
// Admin → Users (tick people, the bar of actions, Export, the sticky column names, a saved view,
// and the read-only demo admin refused), the language button (top bar, and the phone's side menu),
// a chat's "2 new" button while reading further up, forwarding with a comment, a removed
// notification brought back with Undo (and one really removed), a file dropped and one pasted on
// the course materials form. Axe at 390 and 1280 px, light and dark, no sideways scrolling.
// Everything made here is removed at the end.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const S = 'demo@student.com', A = 'alice@student.com', T = 'demo@teacher.com', AD = 'demo@admin.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const send = (who, path, body, method) => fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined });
const call = async (who, path, body, method) => { const r = await send(who, path, body, method).catch(() => send(who, path, body, method)); return { s: r.status, b: await r.json().catch(() => ({})) }; };
const sql = (c) => execSync(`npx wrangler d1 execute universe-db --local --json --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, encoding: 'utf8' });
const rows = (c) => JSON.parse(sql(c))[0]?.results ?? [];
const ts = (d = new Date()) => d.toISOString().replace('Z', '+00:00');
const uid = (email) => rows(`SELECT id FROM users WHERE email='${email}'`)[0].id;
const out = { checks: [], axe: [], wide: [] };
const ok = (name, v) => out.checks.push(`${v ? '✓' : '✗'} ${name}`);
const shades = [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']];

async function axe(page, where) {
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
  if (v.length) out.axe.push(`${where}: ${v.join('; ')}`);
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) out.wide.push(where);
}

const sId = uid(S), aId = uid(A);
const made = { notes: [], convo: null, other: null, began: ts() };
const browser = await launch();
try {
  const me = {};
  for (const e of [S, A, T, AD]) me[e] = (await call(e, '/api/core/auth/me')).b;
  const open = async (who, width, theme, extra = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', acceptDownloads: true, ...(width < 500 ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.addInitScript(([t, u, th, more]) => {
      localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
      localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1');
      for (const [k, v] of Object.entries(more)) localStorage.setItem(k, v);
    }, [`mock-token-${who}`, me[who], theme, extra]);
    return { ctx, page: await ctx.newPage() };
  };

  // ── Admin → Users ──
  for (const [width, theme] of shades) {
    const { ctx, page } = await open(AD, width, theme);
    await page.goto(`${base}/admin/users`, { waitUntil: 'networkidle', timeout: 60_000 });
    const boxes = page.getByRole('checkbox', { name: /^Select (?!every)/ });
    await boxes.first().waitFor({ timeout: 20_000 });
    await boxes.nth(0).check(); await boxes.nth(1).check();
    const bar = page.getByRole('region', { name: 'Selected people' });
    if (width === 1280 && theme === 'light') {
      ok('two ticked: the bar says "2 selected"', /2 selected/.test(await bar.innerText()));
      ok('the column names stay on top (sticky)', await page.locator('thead').first().evaluate((el) => getComputedStyle(el).position === 'sticky'));
      const [dl] = await Promise.all([page.waitForEvent('download'), bar.getByRole('button', { name: 'Export' }).click()]);
      const csv = readFileSync(await dl.path(), 'utf8');
      ok(`Export of the ticked people: ${dl.suggestedFilename()}, ${csv.split(/\r\n/).length - 1} rows`, /\.csv$/.test(dl.suggestedFilename()) && csv.includes('Name,Email,Phone,Role') && csv.split(/\r\n/).length === 3);
      await bar.getByRole('button', { name: 'Deactivate' }).click();
      ok('the demo admin can look but not change: refused', await page.getByText(/read-only/i).first().waitFor({ timeout: 10_000 }).then(() => true, () => false));
      await page.getByRole('button', { name: 'Any role' }).click();
      await page.getByRole('button', { name: /^Teachers/ }).click();
      await page.getByRole('button', { name: 'Save view' }).click();
      await page.getByRole('textbox').last().fill('Just teachers');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('button', { name: 'Teacher', exact: false }).first().waitFor();
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Just teachers', exact: true }).click();
      ok('a saved view comes back after reloading and applies its filters', await page.getByRole('button', { name: /^Teacher/ }).first().isVisible());
    }
    await axe(page, `admin users ${width} ${theme}${await bar.count() ? ' (2 ticked)' : ''}`);
    await ctx.close();
  }
  const renew = await call(AD, '/api/core/users/invitations/nope/renew', {});
  ok(`renewing an invitation as the demo admin: refused (${renew.s})`, renew.s === 403);

  // ── The language button ──
  {
    const { ctx, page } = await open(S, 1280, 'light');
    await page.goto(`${base}/student`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByRole('button', { name: 'Language' }).first().click();
    await page.getByRole('menuitemradio', { name: /Español/ }).click();
    ok('top bar → Español: the page is in Spanish', await page.waitForFunction(() => document.documentElement.lang === 'es', null, { timeout: 5000 }).then(() => true, () => false));
    await page.getByRole('button', { name: 'Language' }).first().click();
    await axe(page, 'language menu 1280 light');
    await page.getByRole('menuitemradio', { name: /English/ }).click();
    await ctx.close();
  }
  for (const theme of ['light', 'dark']) {
    const { ctx, page } = await open(S, 390, theme);
    await page.goto(`${base}/student`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.locator('nav[aria-label="Primary"] button').last().tap();
    await page.waitForTimeout(600);
    await page.getByRole('complementary', { name: 'Navigation' }).getByRole('button', { name: 'Language' }).tap();
    const menu = page.getByRole('menu', { name: 'Language' });
    const box = await menu.boundingBox();
    if (theme === 'light') ok(`phone side menu → Language: the list opens on screen (top ${Math.round(box?.y ?? -1)})`, !!box && box.y >= 0 && box.y + box.height <= 844);
    await axe(page, `side menu language 390 ${theme}`);
    await ctx.close();
  }

  // ── Chat: "2 new" while reading further up, forward with a comment ──
  made.convo = (await call(S, '/api/chat/conversations', { userId: aId })).b.id;
  made.other = (await call(S, '/api/chat/conversations', { userId: uid('bob@student.com') })).b.id;
  for (let i = 0; i < 30; i++) await call(A, `/api/chat/conversations/${made.convo}/messages`, { type: 'TEXT', body: `Phase E history ${i + 1}: ${'a fairly long line so the chat scrolls '.repeat(2)}` });
  {
    const { ctx, page } = await open(S, 1280, 'light');
    await page.goto(`${base}/student/inbox?c=${made.convo}`, { waitUntil: 'networkidle', timeout: 60_000 });
    const log = page.getByLabel('Messages', { exact: true });
    await log.getByText(/^Phase E history 30/).waitFor({ timeout: 20_000 });
    // Up to the top of the history (the nearest scrolling box around the messages).
    await log.getByText(/^Phase E history 30/).evaluate((el) => {
      let s = el.parentElement;
      while (s && !(s.scrollHeight > s.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
      if (s) { s.scrollTop = 0; s.dispatchEvent(new Event('scroll', { bubbles: true })); }
    });
    await page.waitForTimeout(500);
    await call(A, `/api/chat/conversations/${made.convo}/messages`, { type: 'TEXT', body: 'Phase E new one' });
    await call(A, `/api/chat/conversations/${made.convo}/messages`, { type: 'TEXT', body: 'Phase E new two' });
    const pill = page.getByRole('button', { name: /2 new/ });
    ok('two messages arrive while reading history: "2 new"', await pill.waitFor({ timeout: 40_000 }).then(() => true, () => false));
    await axe(page, 'chat with "2 new" 1280 light');
    if (await pill.count()) { await pill.click(); await page.waitForTimeout(900); }
    ok('tapping it goes to the newest and the count goes', !(await page.getByRole('button', { name: /\d+ new/ }).count()) && await log.getByText('Phase E new two').isVisible());
    // Forward the last message to the chat with Bob, with a comment.
    await log.getByText('Phase E new two').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Forward' }).or(page.getByRole('button', { name: 'Forward' })).first().click();
    await page.getByRole('dialog').getByRole('button', { name: /Bob/ }).first().click();
    await page.getByLabel('Add a message (optional)').fill('Phase E: see this');
    await axe(page, 'forward sheet 1280 light');
    await page.getByRole('dialog').getByRole('button', { name: /^Forward/ }).last().click();
    await page.waitForTimeout(1500);
    const last = rows(`SELECT body, forwarded FROM messages WHERE conversationId='${made.other}' ORDER BY createdAt DESC LIMIT 2`);
    ok(`forwarded with a comment: ${JSON.stringify(last.map((m) => m.body))}`, last.length === 2 && last[0].body === 'Phase E: see this' && last[1].body === 'Phase E new two' && !!last[1].forwarded);
    await ctx.close();
  }

  // ── Undo after removing a notification ──
  for (let i = 0; i < 2; i++) {
    const id = `phasee${i}${Date.now()}`;
    sql(`INSERT INTO notifications (id, userId, title, body, type, read, createdAt) VALUES ('${id}', '${sId}', 'Phase E note ${i + 1}', 'Remove me', 'info', 0, '${ts()}')`);
    made.notes.push(id);
  }
  {
    const { ctx, page } = await open(S, 390, 'light');
    await page.goto(`${base}/notifications`, { waitUntil: 'networkidle', timeout: 60_000 });
    const row = (n) => page.getByText(`Phase E note ${n}`);
    await row(1).waitFor({ timeout: 20_000 });
    const remove = (n) => page.getByRole('button', { name: `Remove “Phase E note ${n}”` }).click();
    await remove(1);
    const undo = page.getByRole('button', { name: 'Undo' });
    ok('removing a notification offers Undo', await undo.waitFor({ timeout: 5000 }).then(() => true, () => false));
    await page.waitForTimeout(800); // the row's fade-out finished
    await axe(page, 'notifications with Undo 390 light');
    if (await undo.count()) await undo.click();
    await page.waitForTimeout(600);
    ok('Undo brings it back', await row(1).isVisible());
    await remove(2);
    await page.waitForTimeout(7000);
    ok('without Undo it is deleted for real', rows(`SELECT id FROM notifications WHERE id='${made.notes[1]}'`).length === 0 && rows(`SELECT id FROM notifications WHERE id='${made.notes[0]}'`).length === 1);
    await ctx.close();
  }

  // ── A file dropped, and one pasted, on the course materials form ──
  {
    const { ctx, page } = await open(T, 1280, 'light');
    await page.goto(`${base}/teacher/blackboard?course=${C}&tab=materials`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByRole('button', { name: 'Add material' }).first().click();
    const zone = page.getByText(/Choose a file \(up to 4 MB\)/).locator('xpath=ancestor::div[1]');
    const give = (how) => zone.evaluate((el, how) => {
      const dt = new DataTransfer();
      dt.items.add(new File([`Phase E ${how}`], `phase-e-${how}.txt`, { type: 'text/plain' }));
      if (how === 'drop') { for (const t of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true })); }
      else el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, how);
    await give('drop');
    ok('a dropped file is taken', await page.getByText('phase-e-drop.txt').waitFor({ timeout: 20_000 }).then(() => true, () => false));
    await page.getByRole('button', { name: /Close|Cancel/ }).first().click().catch(() => {});
    await page.getByRole('button', { name: 'Add material' }).first().click();
    await give('paste');
    ok('a pasted file is taken', await page.getByText('phase-e-paste.txt').waitFor({ timeout: 20_000 }).then(() => true, () => false));
    await axe(page, 'materials form 1280 light');
    await ctx.close();
  }
} finally {
  await browser.close();
  if (made.notes.length) sql(`DELETE FROM notifications WHERE id IN (${made.notes.map((n) => `'${n}'`).join(',')})`);
  if (made.convo) sql(`DELETE FROM messages WHERE conversationId IN ('${made.convo}','${made.other}') AND createdAt >= '${made.began}'`);
  console.log(JSON.stringify(out, null, 1));
}
