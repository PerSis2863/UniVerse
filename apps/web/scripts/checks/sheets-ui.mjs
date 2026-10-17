// Spreadsheets in the browser: made from a template, formulas worked out, typing with function
// suggestions, bold, undo, a second sheet, an Excel download, a comment on a cell, a version kept,
// and two people editing at once. Axe at 390/1280, light/dark.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', T = 'demo@teacher.com', B = 'bob@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
for (const d of (await call(T, '/api/docs')).docs ?? []) if (d.title?.startsWith('Sheet UI')) await call(T, `/api/docs/${d.id}`, null, 'DELETE');
const made = await call(T, '/api/docs', { kind: 'sheet', title: 'Sheet UI test' });
console.log('created', JSON.stringify(made));
await call(T, `/api/docs/${made.id}/members`, { email: B, role: 'EDITOR' });
async function context(browser, email, { width = 390, theme = 'light' } = {}) {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(([t, user, th]) => { localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 })); localStorage.setItem('theme', th); }, [token, me, theme]);
  return ctx;
}
async function axe(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const go = async (page, ref) => { const box = page.getByLabel('Cell or range (type one to go there)'); await box.click(); await box.fill(ref); await box.press('Enter'); await page.waitForTimeout(150); };
const active = (page) => page.locator('[role="gridcell"][id$="-active"]').getAttribute('aria-label');
const browser = await launch();
let first = true;
for (const theme of ['light', 'dark']) for (const width of [1280, 390]) {
  const act = first; first = false;
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { theme, width, axe: [] };
  await page.goto(`${base}/sheets/${made.id}${act ? '?template=gradebook' : ''}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByText('Saved as you type').waitFor({ timeout: 30_000 });
  await page.getByRole('gridcell', { name: /./ }).first().waitFor({ timeout: 20_000 }).catch(() => {});
  await page.getByText('Gradebook', { exact: true }).first().waitFor({ timeout: 20_000 });
  await go(page, 'E4'); r.e4 = await active(page);
  await go(page, 'F4'); r.f4 = await active(page);
  if (act) {
    await go(page, 'A12');
    await page.keyboard.type('=AVER');
    r.suggest = await page.getByRole('option', { name: /AVERAGE/ }).first().innerText({ timeout: 5000 }).then((t) => t.split('\n')[0]).catch(() => 'missing');
    await page.keyboard.press('Escape');
    await page.keyboard.type('=SUM(B4:B9)');
    await page.keyboard.press('Enter');
    await go(page, 'A12'); r.sum = await active(page);
    await page.getByRole('button', { name: 'Bold' }).click();
    r.bold = await page.locator('[role="gridcell"][id$="-active"] span.relative').first().evaluate((el) => getComputedStyle(el.parentElement).fontWeight).catch(() => '?');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    r.boldAfterUndo = await page.locator('[role="gridcell"][id$="-active"] span.relative').first().evaluate((el) => getComputedStyle(el.parentElement).fontWeight).catch(() => '?');
    // Fill down: B12 = B4 then drag-fill isn't easy in a test; Ctrl+D fills a selection.
    await go(page, 'H4'); await page.keyboard.type('=B4*2'); await page.keyboard.press('Enter');
    await go(page, 'H4:H6'); await page.keyboard.press('Control+d');
    await go(page, 'H6'); r.filled = await active(page);
    // Copy and paste.
    await go(page, 'H4'); await page.keyboard.press('Control+c'); await go(page, 'I4'); await page.keyboard.press('Control+v');
    await page.waitForTimeout(300);
    await go(page, 'I4'); r.pasted = await active(page);
    // A second sheet.
    await page.getByRole('button', { name: 'Add a sheet' }).click();
    r.tabs = await page.getByRole('tab').allInnerTexts();
    await page.getByRole('tab', { name: 'Marks' }).click();
    // A comment on a cell.
    await go(page, 'A4');
    await page.getByRole('button', { name: 'Comments' }).click();
    await page.getByRole('button', { name: 'About the selected cells' }).click();
    await page.getByRole('combobox', { name: 'Comment' }).fill('Check this name');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(1500);
    r.comment = (await call(T, `/api/docs/${made.id}/comments`))[0]?.quote;
    r.marked = await page.locator('[title="Has a comment"]').count();
    await page.getByRole('button', { name: 'Close' }).click().catch(() => {});
    // Excel download.
    const dl = page.waitForEvent('download', { timeout: 15_000 });
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: /Excel workbook/ }).click();
    const file = await dl;
    r.download = file.suggestedFilename();
    const path = await file.path();
    const bytes = (await import('node:fs')).readFileSync(path);
    r.zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    // Someone else editing at the same time.
    const ctx2 = await context(browser, B, { width: 1280, theme: 'light' });
    const p2 = await ctx2.newPage();
    p2.on('pageerror', (e) => errors.push(`bob: ${e.message}`));
    await p2.goto(`${base}/sheets/${made.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
    await p2.getByText('Gradebook', { exact: true }).first().waitFor({ timeout: 20_000 });
    await go(p2, 'B15'); await p2.keyboard.type('From Bob'); await p2.keyboard.press('Enter');
    await page.getByText('From Bob').waitFor({ timeout: 10_000 }).then(() => { r.live = 'seen'; }).catch(() => { r.live = 'not seen'; });
    r.presence = await page.getByText('Bob', { exact: false }).count();
    await ctx2.close();
    // A version for the history, a few seconds after the last edit.
    await page.waitForTimeout(9500);
    const versions = await call(T, `/api/docs/${made.id}/versions`);
    r.versions = versions.length;
    if (versions[0]) { const v = await call(T, `/api/docs/${made.id}/versions/${versions[0].id}`); r.versionData = !!v.data && JSON.parse(v.data).sheets.length; }
    await page.getByRole('button', { name: 'Version history' }).click();
    await page.getByRole('dialog', { name: 'Version history' }).waitFor();
    r.axe.push(...(await axe(page)).map((x) => `history ${x}`));
    await page.keyboard.press('Escape');
  }
  r.axe.push(...(await axe(page)));
  r.wide = await wide(page);
  // The Docs list shows it as a spreadsheet.
  await page.goto(`${base}/docs`, { waitUntil: 'networkidle' });
  r.listed = await page.getByRole('img', { name: 'spreadsheet' }).count();
  if (act) { await page.getByRole('button', { name: 'New spreadsheet' }).click(); r.templates = await page.getByRole('radio').allInnerTexts(); }
  r.axe.push(...(await axe(page)).map((x) => `docs ${x}`));
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}
await browser.close();
await call(T, `/api/docs/${made.id}`, null, 'DELETE');
