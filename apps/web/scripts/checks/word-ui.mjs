// Word features in a document: style, font size, colour, alignment, superscript, a page break, a
// table of contents, find and replace, word count, page setup, and the Word copy carrying them.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const { unzipSync } = require('fflate');
const base = 'http://localhost:8787', T = 'demo@teacher.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
for (const d of (await call(T, '/api/docs')).docs ?? []) if (d.title?.startsWith('Word UI')) await call(T, `/api/docs/${d.id}`, null, 'DELETE');
const made = await call(T, '/api/docs', { title: 'Word UI test' });
async function context(browser, email, { width = 390, theme = 'light' } = {}) {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, acceptDownloads: true });
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
const browser = await launch();
let first = true;
for (const theme of ['light', 'dark']) for (const width of [1280, 390]) {
  const act = first; first = false;
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { theme, width, axe: [] };
  await page.goto(`${base}/docs/${made.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByText('Saved as you type').waitFor({ timeout: 30_000 });
  const text = page.getByRole('textbox', { name: 'Document text' });
  if (act) {
    await text.click();
    await page.getByLabel('Style').selectOption('h1');
    await page.keyboard.type('Volcanoes');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Table of contents' }).click();
    await page.keyboard.type('Water is H2O and lava is hot. Lava flows.');
    // Select "2" and make it subscript; select the sentence and make it red, 14 pt, centred.
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.waitForTimeout(150); // as a person would: the editor reads the selection a moment later
    await page.getByLabel('Font size').selectOption('14');
    await page.getByRole('button', { name: 'Text colour' }).click();
    await page.getByRole('button', { name: '#c00000' }).click();
    await page.getByRole('button', { name: 'Centre' }).click();
    await page.keyboard.press('End');
    await page.waitForTimeout(150);
    await page.keyboard.press('Control+Enter');
    await page.getByLabel('Style').selectOption('h2');
    await page.keyboard.type('Method');
    await page.waitForTimeout(500);
    r.toc = await page.locator('nav[data-toc] li').allInnerTexts();
    r.pageBreak = await page.locator('[data-page-break]').count();
    r.words = (await page.getByText(/^· \d+ words?$/).first().innerText().catch(() => '')).trim();
    // Find and replace.
    await text.click();
    await page.keyboard.press('Control+f');
    await page.getByRole('search', { name: 'Find and replace' }).getByLabel('Find', { exact: true }).fill('lava');
    await page.waitForTimeout(500);
    r.findBar = await page.getByRole('search').innerText();
    r.docText = (await text.innerText()).slice(0, 300);
    console.log(JSON.stringify(r));
    r.found = await page.getByRole('search').getByText(/of \d+/).innerText({ timeout: 3000 });
    await page.getByLabel('Replace with').fill('magma');
    await page.getByRole('button', { name: 'Replace all' }).click();
    r.replaced = await text.innerText();
    r.axe.push(...(await axe(page)).map((x) => `find ${x}`));
    await page.getByRole('button', { name: 'Close find' }).click();
    // Page setup.
    await page.getByRole('button', { name: 'Download or import' }).click();
    await page.getByRole('button', { name: /Page setup/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Page setup' });
    await sheet.getByText('Landscape').click();
    await sheet.getByLabel(/Footer/).fill('Ana B.');
    await sheet.getByLabel(/Page numbers/).check();
    r.axe.push(...(await axe(page)).map((x) => `page ${x}`));
    await page.keyboard.press('Escape');
    // The Word copy.
    await page.waitForTimeout(500);
    const dl = page.waitForEvent('download', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Download or import' }).click();
    await page.getByRole('button', { name: 'Word (.docx)' }).click();
    const file = await dl;
    const parts = unzipSync(new Uint8Array(readFileSync(await file.path())));
    const body = new TextDecoder().decode(parts['word/document.xml']);
    r.docx = { pageBreak: body.includes('w:type="page"'), landscape: body.includes('w:orient="landscape"'), red: body.includes('C00000'), size: body.includes('<w:sz w:val="28"/>'), centred: body.includes('<w:jc w:val="center"/>'), footer: !!parts['word/footer1.xml'], contents: body.includes('Contents') };
  }
  r.axe.push(...(await axe(page)));
  r.wide = await wide(page);
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}
await browser.close();
await call(T, `/api/docs/${made.id}`, null, 'DELETE');
