// M230 projects: a board with dated cards, a milestone and a card waiting on another; the Timeline shows them as a
// Gantt chart (bars, a diamond, a line between them), dragging a bar moves both its dates (saved), a start after the
// due day is refused, time logged by hand adds to the card's total against its estimate, and the timer starts; axe at
// 1280 and 390 px, light and dark. Runs against `local:serve` (or BASE=… for local:dev).
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787';
const H = { Authorization: 'Bearer mock-token-alice@student.com', 'Content-Type': 'application/json' };
const call = async (path, body, method = body ? 'POST' : 'GET') => { const r = await fetch(`${base}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, b: await r.json().catch(() => null) }; };
const day = (n, h = 17) => { const d = new Date(); d.setHours(h, 0, 0, 0); d.setDate(d.getDate() + n); return d.toISOString(); };
const out = { errors: [] };
const id = (await call('/api/tasks', { title: 'Gantt check' })).b.id;
const browser = await launch();
try {
  const board = (await call(`/api/tasks/${id}`)).b;
  const list = [...board.lists].sort((a, b) => a.position - b.position)[0].id;
  const a = (await call(`/api/tasks/${id}/items`, { listId: list, title: 'Design the poster' })).b.id;
  const b = (await call(`/api/tasks/${id}/items`, { listId: list, title: 'Print the poster' })).b.id;
  const m = (await call(`/api/tasks/${id}/items`, { listId: list, title: 'Science fair' })).b.id;
  await call(`/api/tasks/items/${a}`, { startAt: day(1, 9), dueAt: day(4), estimate: 2 }, 'PATCH');
  await call(`/api/tasks/items/${b}`, { startAt: day(5, 9), dueAt: day(7), blockedBy: [a] }, 'PATCH');
  await call(`/api/tasks/items/${m}`, { milestone: true, dueAt: day(9) }, 'PATCH');
  out.badStart = (await call(`/api/tasks/items/${a}`, { startAt: day(6, 9) }, 'PATCH')).s; // after its due day: 400
  out.badTime = (await call(`/api/tasks/items/${a}/time`, { minutes: 0 })).s; // 400
  for (const [w, theme] of [[1280, 'light'], [1280, 'dark'], [390, 'light'], [390, 'dark']]) {
    const ctx = await signedIn(browser, base, 'alice@student.com', { width: w, height: 900 }, { colorScheme: theme });
    await ctx.addInitScript((t) => { localStorage.setItem('uv-cookies', 'essential'); localStorage.setItem('theme', t); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => out.errors.push(e.message.slice(0, 160)));
    await page.goto(`${base}/tasks/${id}`, { waitUntil: 'load', timeout: 180_000 });
    await page.getByRole('button', { name: 'Timeline' }).click({ timeout: 120_000 });
    const bar = page.getByRole('button', { name: 'Design the poster' });
    await bar.waitFor({ timeout: 20_000 });
    const r = { bars: await page.locator('[data-gantt-rows] > div').count(), links: await page.locator('[data-gantt-rows] svg path').count(), milestone: await page.getByRole('button', { name: /Milestone: Science fair/ }).count() };
    if (w === 1280 && theme === 'light') {
      // Drag the first bar two days later.
      const box = await bar.boundingBox(), dayPx = (await page.locator('[data-gantt-rows]').boundingBox()).width / 56;
      await page.mouse.move(box.x + 20, box.y + box.height / 2); await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 20 + (dayPx * 2 * i) / 8, box.y + box.height / 2);
      await page.mouse.up();
      let t;
      for (let i = 0; i < 60; i++) { t = (await call(`/api/tasks/${id}`)).b.tasks.find((x) => x.id === a); if (t.dueAt !== day(4)) break; await page.waitForTimeout(500); }
      r.movedDays = Math.round((new Date(t.dueAt) - new Date(day(4))) / 864e5);
      r.startMoved = Math.round((new Date(t.startAt) - new Date(day(1, 9))) / 864e5);
      r.sheetOpenedByDrag = await page.getByRole('dialog').count();
      await page.screenshot({ path: process.env.SHOT ?? '/tmp/gantt.png' });
      // Open it and log time by hand.
      await bar.click(); await page.getByRole('dialog').waitFor();
      await page.getByLabel(/Time to add/).fill('1:30'); await page.getByRole('button', { name: 'Add time' }).click();
      await page.getByText('1 h 30 min of 2 h planned').waitFor({ timeout: 10_000 }).then(() => { r.logged = true; }).catch(() => { r.logged = false; });
      await page.getByRole('button', { name: 'Start timer' }).click();
      r.timer = await page.getByRole('button', { name: 'Stop and log' }).count();
      await page.getByRole('button', { name: 'Discard' }).click();
    }
    await page.waitForTimeout(800); // the chosen tab's pill settles
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.target}`));
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    out[`${w}-${theme}`] = r;
    await ctx.close();
  }
} finally {
  await browser.close();
  await call(`/api/tasks/${id}`, null, 'DELETE');
  console.log(JSON.stringify(out, null, 1));
}
