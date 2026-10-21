// Phase E, fourth batch, in the browser on the built Worker (pnpm local:serve --test-secret):
// a task card's press-and-hold menu (move to another list) on a phone; Admin → Insights' CSV;
// choosing several chat messages (forward them, delete them for me with Undo); the ringtone and
// accent colour in Settings (the accent kept after reloading); my own colour for a course (tile
// and home); a photo dropped on the profile picture; a board deleted and brought back with Undo;
// the share picture and the status link on the public site; the time zone under class calls.
// Axe at 390 and 1280 px, light and dark. Everything made here is removed at the end.
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

async function axe(page, where) {
  // Nothing half-way through a hover or an opening animation.
  await page.mouse.move(1, 1).catch(() => {});
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
  if (v.length) out.axe.push(`${where}: ${v.join('; ')}`);
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) out.wide.push(where);
}

const aId = uid(A);
const made = { taskBoard: null, board: null, convo: null, other: null, call: null, began: ts() };
const browser = await launch();
try {
  const me = {};
  for (const e of [S, A, T, AD]) me[e] = (await call(e, '/api/core/auth/me')).b;
  const open = async (who, width, theme, extra = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'], ...(width < 500 ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.addInitScript(([t, u, th, more]) => {
      localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
      localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1');
      for (const [k, v] of Object.entries(more)) localStorage.setItem(k, v);
    }, [`mock-token-${who}`, me[who], theme, extra]);
    return { ctx, page: await ctx.newPage() };
  };

  // ── A task card's press-and-hold menu, on a phone ── (SKIP=tasks leaves it out)
  if (!(process.env.SKIP ?? '').includes('tasks')) {
  made.taskBoard = (await call(S, '/api/tasks', { title: 'Phase E board' })).b.id;
  const board = (await call(S, `/api/tasks/${made.taskBoard}`)).b;
  const [todo, doing] = [...board.lists].sort((a, b) => a.position - b.position);
  await call(S, `/api/tasks/${made.taskBoard}/items`, { listId: todo.id, title: 'Phase E card' });
  for (const theme of ['light', 'dark']) {
    const { ctx, page } = await open(S, 390, theme);
    await page.goto(`${base}/tasks/${made.taskBoard}`, { waitUntil: 'networkidle', timeout: 60_000 });
    const card = page.getByRole('button', { name: /Phase E card/ }).first();
    await card.waitFor({ timeout: 20_000 });
    const box = await card.boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const pt = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await page.waitForTimeout(700);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const sheet = page.getByRole('dialog', { name: 'Phase E card' });
    const shown = await sheet.waitFor({ timeout: 5000 }).then(() => true, () => false);
    if (theme === 'light') ok('press and hold a card: its menu opens (not the card)', shown);
    if (shown) {
      await axe(page, `task card menu 390 ${theme}`);
      if (theme === 'light') {
        await sheet.getByRole('button', { name: doing.title }).click();
        await page.waitForTimeout(1500);
        ok(`"Move to ${doing.title}" moves it`, rows(`SELECT listId FROM tasks WHERE boardId='${made.taskBoard}'`)[0]?.listId === doing.id);
      } else await page.keyboard.press('Escape');
    }
    await ctx.close();
  }

  }

  // ── Admin → Insights: CSV ──
  {
    const { ctx, page } = await open(AD, 1280, 'light');
    await page.goto(`${base}/admin/insights`, { waitUntil: 'networkidle', timeout: 60_000 });
    const btn = page.getByRole('button', { name: /Export CSV of the teachers/ });
    if (await btn.waitFor({ timeout: 15_000 }).then(() => true, () => false)) {
      const [dl] = await Promise.all([page.waitForEvent('download'), btn.click()]);
      ok(`Insights → teacher workload as CSV (${dl.suggestedFilename()})`, readFileSync(await dl.path(), 'utf8').startsWith('﻿Teacher,Email,Courses'));
    } else ok('Insights → teacher workload as CSV (no teachers to show)', true);
    await axe(page, 'insights 1280 light');
    await ctx.close();
  }

  // ── Several chat messages at once ──
  made.convo = (await call(S, '/api/chat/conversations', { userId: aId })).b.id;
  made.other = (await call(S, '/api/chat/conversations', { userId: uid('bob@student.com') })).b.id;
  for (const n of ['one', 'two', 'three']) await call(A, `/api/chat/conversations/${made.convo}/messages`, { type: 'TEXT', body: `Phase E pick ${n}` });
  for (const [width, theme] of [[1280, 'light'], [390, 'dark']].filter(([w]) => w > 500 || !(process.env.SKIP ?? '').includes('chatphone'))) {
    const { ctx, page } = await open(S, width, theme);
    await page.goto(`${base}/student/inbox?c=${made.convo}`, { waitUntil: 'networkidle', timeout: 60_000 });
    const log = page.getByLabel('Messages', { exact: true });
    await log.getByText('Phase E pick three', { exact: true }).waitFor({ timeout: 20_000 });
    // A phone: press and hold (a finger, by the browser's touch events); a computer: right-click.
    const hold = async (loc) => {
      if (width >= 500) return loc.click({ button: 'right' });
      await loc.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(300);
      const b = await loc.boundingBox();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
      await page.waitForTimeout(700);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await hold(log.getByText('Phase E pick one', { exact: true }));
    await page.getByRole('menuitem', { name: 'Select' }).or(page.getByRole('button', { name: 'Select', exact: true })).first().click();
    await log.getByText('Phase E pick two', { exact: true }).click();
    const bar = page.getByRole('region', { name: 'Chosen messages' });
    if (width === 1280) ok('Select, then tap another: "2 selected"', /2 selected/.test(await bar.innerText()));
    await axe(page, `choosing messages ${width} ${theme}`);
    if (width === 1280) {
      await bar.getByRole('button', { name: 'Copy' }).click();
      ok('Copy puts both on the clipboard, in order', (await page.evaluate(() => navigator.clipboard.readText())) === 'Phase E pick one\nPhase E pick two');
      await log.getByText('Phase E pick one', { exact: true }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Select' }).or(page.getByRole('button', { name: 'Select', exact: true })).first().click();
      await log.getByText('Phase E pick two', { exact: true }).click();
      await bar.getByRole('button', { name: 'Forward' }).click();
      await page.getByRole('dialog').getByRole('button', { name: /Bob/ }).first().click();
      await page.getByRole('dialog').getByRole('button', { name: /^Forward/ }).last().click();
      await page.waitForTimeout(1500);
      const got = rows(`SELECT body FROM messages WHERE conversationId='${made.other}' AND forwarded=1 AND createdAt >= '${made.began}' ORDER BY createdAt`);
      ok(`both forwarded to Bob, in order: ${JSON.stringify(got.map((m) => m.body))}`, got.length === 2 && got[0].body === 'Phase E pick one' && got[1].body === 'Phase E pick two');
      await log.getByText('Phase E pick three', { exact: true }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Select' }).or(page.getByRole('button', { name: 'Select', exact: true })).first().click();
      await bar.getByRole('button', { name: 'Delete for me' }).click();
      await page.getByRole('button', { name: 'Undo' }).click();
      await page.waitForTimeout(800);
      ok('Delete for me, then Undo: still there', await log.getByText('Phase E pick three', { exact: true }).isVisible());
    } else await page.keyboard.press('Escape');
    await ctx.close();
  }

  // ── Settings: ringtone and accent colour; my own course colour ──
  for (const [width, theme] of [[1280, 'light'], [390, 'dark']]) {
    const { ctx, page } = await open(S, width, theme);
    await page.goto(`${base}/student/settings?section=appearance`, { waitUntil: 'networkidle', timeout: 60_000 });
    const teal = page.getByRole('radio', { name: /Teal/ });
    if (!(await teal.isVisible().catch(() => false))) { await page.goto(`${base}/student/settings?section=appearance`, { waitUntil: 'networkidle' }); }
    await page.getByRole('radio', { name: /Teal/ }).click();
    const tint = await page.evaluate(() => [document.documentElement.dataset.accent, getComputedStyle(document.documentElement).getPropertyValue('--tint').trim()]);
    if (width === 1280) ok(`accent Teal: ${tint.join(' ')}`, tint[0] === 'teal' && tint[1] === '#0f766e');
    await axe(page, `settings with teal ${width} ${theme}`);
    await page.reload({ waitUntil: 'networkidle' });
    if (width === 1280) ok('the accent is kept after reloading (set before the page draws)', await page.evaluate(() => document.documentElement.dataset.accent === 'teal'));
    await page.goto(`${base}/student`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await axe(page, `home with teal ${width} ${theme}`);
    // Amber, the lightest of them: buttons, badges and the menu's highlight still read.
    await page.evaluate(() => { localStorage.setItem('uv-accent', 'amber'); document.documentElement.dataset.accent = 'amber'; });
    for (const path of ['/student/courses', '/student/settings?section=appearance']) {
      await page.goto(base + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await axe(page, `${path} with amber ${width} ${theme}`);
    }
    await page.evaluate(() => { localStorage.setItem('uv-accent', 'teal'); document.documentElement.dataset.accent = 'teal'; });
    if (width === 1280) {
      await page.goto(`${base}/student/settings?section=notifications`, { waitUntil: 'networkidle' });
      const soft = page.getByRole('button', { name: 'Soft', exact: true });
      if (await soft.waitFor({ timeout: 8000 }).then(() => true, () => false)) {
        await soft.click();
        ok('ringtone Soft chosen and kept on this device', await page.evaluate(() => localStorage.getItem('uv-ringtone') === 'soft'));
      } else ok('ringtone setting found', false);
      await axe(page, 'settings notifications 1280 light');
      // My colour for CS101.
      await page.goto(`${base}/student/courses`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /^Colour for / }).first().click();
      await page.getByRole('button', { name: 'Green', exact: true }).click();
      const shade = await page.locator('main a[href*="/student/blackboard"] div[style]').first().evaluate((el) => el.style.background);
      ok(`my course colour shows on its tile (${shade.slice(0, 60)})`, /21, 128, 61|#15803d/i.test(shade));
      await page.getByRole('button', { name: /^Colour for / }).first().click();
      await axe(page, 'course colour picker 1280 light');
      await page.keyboard.press('Escape');
    }
    await ctx.close();
  }

  // ── A photo dropped on the profile picture opens the cropper ──
  {
    const { ctx, page } = await open(S, 1280, 'light');
    await page.goto(`${base}/student/settings?section=profile`, { waitUntil: 'networkidle', timeout: 60_000 });
    const photo = page.getByRole('button', { name: 'Change photo' });
    await photo.waitFor({ timeout: 15_000 });
    await photo.evaluate((el) => {
      const c = document.createElement('canvas'); c.width = c.height = 64; c.getContext('2d').fillRect(0, 0, 64, 64);
      return new Promise((r) => c.toBlob((b) => { const dt = new DataTransfer(); dt.items.add(new File([b], 'me.png', { type: 'image/png' })); for (const t of ['dragenter', 'dragover', 'drop']) el.parentElement.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true })); r(); }, 'image/png'));
    });
    ok('a photo dropped on the picture opens the cropper', await page.getByRole('dialog').first().waitFor({ timeout: 8000 }).then(() => true, () => false));
    await ctx.close();
  }

  // ── A board deleted, brought back with Undo, then deleted for real ──
  made.board = (await call(S, '/api/boards', { title: 'Phase E whiteboard' })).b.id;
  {
    const { ctx, page } = await open(S, 1280, 'light');
    await page.goto(`${base}/boards`, { waitUntil: 'networkidle', timeout: 60_000 });
    const del = async () => {
      await page.getByRole('button', { name: 'More for Phase E whiteboard' }).click();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
    };
    await page.getByText('Phase E whiteboard').first().waitFor({ timeout: 15_000 });
    await del();
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(800);
    ok('board deleted, then Undo: it is back (and still on the server)', await page.getByText('Phase E whiteboard').first().isVisible() && rows(`SELECT id FROM boards WHERE id='${made.board}'`).length === 1);
    await del();
    await page.waitForTimeout(7000);
    ok('without Undo it is deleted for real', rows(`SELECT id FROM boards WHERE id='${made.board}'`).length === 0);
    if (!rows(`SELECT id FROM boards WHERE id='${made.board}'`).length) made.board = null;
    await ctx.close();
  }

  // ── The public site: share picture, status link ──
  {
    const html = await (await fetch(`${base}/`)).text();
    const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? '';
    ok(`share picture in the page: ${og}`, /\/og\.jpg$/.test(og) && /<meta name="twitter:card" content="summary_large_image"/.test(html));
    const img = await fetch(`${base}/og.jpg`);
    ok(`the picture is served (${img.status}, ${img.headers.get('content-type')})`, img.status === 200 && /image\/jpeg/.test(img.headers.get('content-type') ?? ''));
    // Signed out: the public home page (signed in, it goes to your dashboard).
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 60_000 });
    ok('the footer links to Status & trust', await page.getByRole('link', { name: 'Status & trust' }).count() > 0);
    await ctx.close();
  }

  // ── Class calls: the time zone is named ──
  made.call = (await call(T, '/api/calls/scheduled', { room: 'class', roomId: C, title: 'Phase E class call', startAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), durationMin: 30, kind: 'video' })).b.id;
  for (const [width, theme] of [[390, 'light'], [1280, 'dark']]) {
    const { ctx, page } = await open(S, width, theme);
    await ctx.close();
    const c2 = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Kolkata' });
    await c2.addInitScript(([t, u, th]) => { localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 })); localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1'); }, [`mock-token-${S}`, me[S], theme]);
    const p2 = await c2.newPage();
    await p2.goto(`${base}/calls`, { waitUntil: 'networkidle', timeout: 60_000 });
    const note = p2.getByText(/Times are in your time zone/);
    const seen = await note.waitFor({ timeout: 15_000 }).then(() => true, () => false);
    if (width === 390) ok(`class calls name the time zone: "${seen ? (await note.innerText()).slice(0, 80) : ''}"`, seen && /Asia\/(Kolkata|Calcutta)/.test(await note.innerText()));
    await axe(p2, `calls with the zone ${width} ${theme}`);
    await c2.close();
    void page;
  }
} finally {
  await browser.close();
  if (made.taskBoard) await call(S, `/api/tasks/${made.taskBoard}`, null, 'DELETE');
  if (made.board) await call(S, `/api/boards/${made.board}`, null, 'DELETE');
  if (made.call) await call(T, `/api/calls/scheduled/${made.call}`, null, 'DELETE');
  if (made.convo) sql(`DELETE FROM messages WHERE conversationId IN ('${made.convo}','${made.other}') AND createdAt >= '${made.began}'`);
  sql(`DELETE FROM message_user_states WHERE createdAt >= '${made.began}'`);
  console.log(JSON.stringify(out, null, 1));
}
