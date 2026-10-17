// Common Cartridge import and export in the browser on the built Worker.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { launch } from '../browser-session.mjs';
import { tmpdir as __tmp } from 'node:os';
const SCRATCH = __tmp();
const require = createRequire(new URL('../../package.json', import.meta.url));
const { unzipSync, strFromU8 } = require('fflate');
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787';
const C = 'cmulde0g900147d341qn9mxlw', T = 'demo@teacher.com', S = 'demo@student.com';
const DIR = `${SCRATCH}/cc`;
const CARTRIDGE = `${DIR}/test.imscc`;
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
const mods = `/api/courses/${C}/modules`;
const CC = ['CC Week 1', 'CC Week 2'];

async function cleanup() {
  for (const m of (await call(T, mods)).modules ?? []) {
    if (!CC.includes(m.title)) continue;
    for (const it of m.items) {
      if (it.kind === 'QUIZ' && it.refId) await fetch(`${base}/api/core/quizzes/${it.refId}`, { method: 'DELETE', headers: H(T) });
      if (it.kind === 'FILE' && it.refId) await fetch(`${base}/api/courses/${C}/board?kind=material&itemId=${it.refId}`, { method: 'DELETE', headers: H(T) });
    }
    await call(T, mods, { action: 'delete-module', moduleId: m.id });
  }
}
await cleanup();

async function context(browser, email, { width = 390, theme = 'light' } = {}) {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, acceptDownloads: true });
  await ctx.addInitScript(([t, user, th]) => { localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 })); localStorage.setItem('theme', th); }, [token, me, theme]);
  return ctx;
}
async function axe(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const openSheet = async (page) => {
  await page.goto(`${base}/teacher/blackboard?course=${C}&tab=modules`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'Import or export' }).click();
  const dlg = page.getByRole('dialog', { name: 'Import or export' });
  await dlg.getByRole('heading', { name: 'Export', exact: true }).waitFor({ timeout: 20_000 });
  return dlg;
};

const browser = await launch();
const out = [];
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const dlg = await openSheet(page);
  const axeStart = await axe(page);
  await dlg.locator('input[type="file"]').setInputFiles(CARTRIDGE);
  await dlg.getByRole('heading', { name: 'CC import test' }).waitFor({ timeout: 20_000 });
  const summary = await dlg.locator('#cc-plan + p').innerText();
  const notIn = await dlg.locator('details li').allInnerTexts();
  const axePlan = await axe(page);
  const r = { theme, width, axeStart, summary, notIn, axePlan, wide: await wide(page) };
  if (theme === 'light' && width === 390) {
    await dlg.getByRole('button', { name: 'Import 2 modules' }).click();
    r.toast = (await page.locator('[data-sonner-toast]').last().innerText({ timeout: 60_000 }).catch(() => '')).split('\n')[0];
    // What arrived.
    const list = (await call(T, mods)).modules.filter((m) => CC.includes(m.title));
    r.modules = list.map((m) => `${m.title} (${m.published ? 'shown' : 'hidden'}): ${m.items.map((i) => `${i.kind}:${i.title}${i.rich ? '(rich)' : ''}${i.missing ? '(missing)' : ''}`).join(', ')}`);
    const pg = list[0]?.items.find((i) => i.kind === 'PAGE');
    if (pg) {
      const body = JSON.parse((await call(T, `${mods}/${pg.id}`)).body);
      const flat = JSON.stringify(body);
      r.page = { blocks: body.content.map((n) => n.type).join(','), picture: (flat.match(/"src":"([^"]+)"/) ?? [])[1]?.slice(0, 30), canvasLinkGone: !flat.includes('CANVAS'), noScript: !flat.includes('alert'), firstHeading: body.content[0]?.content?.[0]?.text };
    }
    const file = list[0]?.items.find((i) => i.kind === 'FILE');
    r.file = file ? { href: file.href?.slice(0, 30), missing: file.missing } : null;
    const quiz = list[1]?.items.find((i) => i.kind === 'QUIZ');
    r.studentSees = (await call(S, mods)).modules.some((m) => CC.includes(m.title));
    r.quiz = !!quiz?.refId;
    // Export, and read the download back.
    await page.keyboard.press('Escape');
    const dlg2 = await openSheet(page);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), dlg2.getByRole('button', { name: 'Download .imscc' }).click()]);
    const path = `${DIR}/export.imscc`;
    await dl.saveAs(path);
    const files = unzipSync(new Uint8Array(readFileSync(path)));
    const manifest = strFromU8(files['imsmanifest.xml']);
    const pages = Object.keys(files).filter((f) => f.startsWith('pages/'));
    r.export = {
      name: dl.suggestedFilename(), files: Object.keys(files).length,
      hasModules: CC.every((t) => manifest.includes(`<title>${t}</title>`)),
      pdf: Object.keys(files).some((f) => f.startsWith('files/') && f.endsWith('.pdf')),
      quiz: Object.keys(files).some((f) => f.endsWith('assessment.xml')),
      welcome: pages.some((f) => strFromU8(files[f]).includes('This week')),
    };
    r.exportToast = (await page.locator('[data-sonner-toast]').last().innerText({ timeout: 10_000 }).catch(() => '')).split('\n')[0];
  }
  r.errors = errors;
  out.push(r);
  await ctx.close();
}
await browser.close();
for (const r of out) console.log(JSON.stringify(r));
await cleanup();
console.log('cleaned', !((await call(T, mods)).modules ?? []).some((m) => CC.includes(m.title)));
