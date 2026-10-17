// Presentations in the browser: from a template, typing in a title, bold, a shape moved by
// dragging, a new slide, notes, presenting (keys, presenter view), PowerPoint download, a comment
// on a slide, a version kept. Axe at 390/1280, light/dark.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const { unzipSync } = require('fflate');
const base = 'http://localhost:8787', T = 'demo@teacher.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
for (const d of (await call(T, '/api/docs')).docs ?? []) if (d.title?.startsWith('Slides UI')) await call(T, `/api/docs/${d.id}`, null, 'DELETE');
const made = await call(T, '/api/docs', { kind: 'slides', title: 'Slides UI test' });
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
  await page.goto(`${base}/slides/${made.id}${act ? '?template=lesson' : ''}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByText('Saved as you type').waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: act ? /^Slide 1: Lesson title/ : /^Slide 1/ }).first().waitFor({ timeout: 20_000 });
  r.slides = await page.locator('nav[aria-label="Slides"] li button').count();
  const canvas = page.getByRole('region', { name: /^Slide 1 of/ });
  if (act) {
    // Type a new title.
    const tb = await canvas.locator('[data-item]').filter({ hasText: 'Lesson title' }).first().boundingBox();
    await page.mouse.dblclick(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await page.locator('[data-editbox]').waitFor({ timeout: 5000 });
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Volcanoes');
    await page.getByRole('button', { name: 'Bold', exact: true }).click();
    await canvas.click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(500);
    r.title = (await page.getByRole('button', { name: /^Slide 1:/ }).locator('.sr-only').innerText()).trim();
    // A shape, dragged.
    await page.getByRole('button', { name: 'Shape' }).click();
    await page.getByRole('menuitem', { name: 'Oval' }).click();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    // Notes.
    await page.getByLabel('Speaker notes').fill('Ask who has seen a volcano');
    await page.getByLabel('Speaker notes').blur();
    // A new slide.
    await page.getByRole('button', { name: 'New slide' }).first().click();
    await page.getByRole('menuitem', { name: 'Two columns' }).click();
    r.slidesAfter = await page.locator('nav[aria-label="Slides"] li button').count();
    // Present from the start, move on with the keys, presenter view, end.
    await page.getByRole('button', { name: 'Present options' }).click();
    await page.getByRole('menuitem', { name: /From the start/ }).click();
    const show = page.getByRole('dialog', { name: 'Presenting' });
    await show.waitFor();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    r.presenting = await show.locator('[aria-live="polite"]').innerText();
    await show.getByRole('button', { name: /Presenter view/ }).click();
    r.notesShown = await show.getByText('Ask who has seen a volcano').count();
    await page.keyboard.press('Home');
    r.notesFirst = await show.getByText('Ask who has seen a volcano').count();
    r.axe.push(...(await axe(page)).map((x) => `present ${x}`));
    await page.keyboard.press('Escape');
    await show.waitFor({ state: 'detached' });
    // PowerPoint download.
    const dl = page.waitForEvent('download', { timeout: 20_000 });
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: /PowerPoint \(\.pptx\)/ }).click();
    const file = await dl;
    r.download = file.suggestedFilename();
    const parts = unzipSync(new Uint8Array(readFileSync(await file.path())));
    r.pptxSlides = Object.keys(parts).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).length;
    r.pptxTitle = new TextDecoder().decode(parts['ppt/slides/slide1.xml']).includes('<a:t>Volcanoes</a:t>');
    r.pptxNotes = new TextDecoder().decode(parts['ppt/notesSlides/notesSlide1.xml']).includes('Ask who has seen a volcano');
    // A comment on this slide.
    await page.getByRole('button', { name: 'Comments' }).click();
    await page.getByRole('button', { name: 'About this slide' }).click();
    await page.getByRole('combobox', { name: 'Comment' }).fill('Add a photo here');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForTimeout(1500);
    r.comment = (await call(T, `/api/docs/${made.id}/comments`))[0]?.quote;
    await page.getByRole('button', { name: 'Close' }).click().catch(() => {});
    await page.waitForTimeout(9500);
    const versions = await call(T, `/api/docs/${made.id}/versions`);
    r.versions = versions.length;
    if (versions[0]) { const v = await call(T, `/api/docs/${made.id}/versions/${versions[0].id}`); r.versionSlides = JSON.parse(v.data ?? '{}').slides?.length; }
    await page.getByRole('button', { name: 'Version history' }).click();
    await page.getByRole('dialog', { name: 'Version history' }).waitFor();
    r.axe.push(...(await axe(page)).map((x) => `history ${x}`));
    await page.keyboard.press('Escape');
  }
  r.axe.push(...(await axe(page)));
  r.wide = await wide(page);
  await page.goto(`${base}/docs`, { waitUntil: 'networkidle' });
  r.listed = await page.getByRole('img', { name: 'presentation' }).count();
  if (act) { await page.getByRole('button', { name: 'New presentation' }).click(); r.templates = await page.getByRole('radio').allInnerTexts(); }
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}
await browser.close();
await call(T, `/api/docs/${made.id}`, null, 'DELETE');
