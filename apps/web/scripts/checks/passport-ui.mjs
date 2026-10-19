// Q14 skills passport in the browser on the built Worker: the portfolio address and colour, making
// the passport public, the wallet credential download, "Add to LinkedIn", Make my CV (look, contact,
// parts, Save as PDF), the public portfolio /p/<handle>, and the employer check /verify (a wallet
// file, a pasted text that isn't valid, a certificate code). Axe at 390/1280, light/dark.
// Adds a passed quiz (evidence) and one test credential for Alice; removes them at the end.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw', T = 'demo@teacher.com', A = 'alice@student.com', B = 'bob@student.com';
const HANDLE = 'alice-passport-ui', CERT = 'passport-ui-cert', CODE = 'UV-TEST-PASSPORT-UI';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => {
  const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: who ? H(who) : { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, b: await r.json().catch(() => ({})) };
};
const sql = (command) => execSync(`npx wrangler d1 execute universe-db --local --command "${command}"`, { cwd: APP, stdio: 'ignore' });

// ── Test data ─────────────────────────────────────────────────────────────
async function cleanup() {
  for (const q of (await call(T, '/api/core/quizzes')).b ?? []) if (q.title?.startsWith('Passport UI')) await call(T, `/api/core/quizzes/${q.id}`, null, 'DELETE');
  sql(`DELETE FROM skill_evidence WHERE userId=(SELECT id FROM users WHERE email='${A}') AND title LIKE 'Passport UI%'`);
  sql(`DELETE FROM impact_certificates WHERE id='${CERT}'`);
  await call(A, '/api/passport', { isPublic: false, handle: null, theme: 'indigo' }, 'PATCH');
}
await cleanup();
const quiz = (await call(T, '/api/core/quizzes', { courseId: C, title: 'Passport UI quiz' })).b;
for (let k = 1; k <= 2; k++) await call(T, `/api/quizzes/${quiz.id}/questions`, { question: `Passport Q${k}: pick yes`, options: ['yes', 'no'], correctAnswer: 'yes', points: 1 });
await call(T, `/api/quizzes/${quiz.id}`, { status: 'PUBLISHED' }, 'PATCH');
const ids = (await call(T, `/api/quizzes/${quiz.id}`)).b.questions.map((q) => q.id);
await call(A, `/api/core/quizzes/${quiz.id}/start`, {});
const submitted = (await call(A, `/api/core/quizzes/${quiz.id}/submit`, { answers: Object.fromEntries(ids.map((id) => [id, 'yes'])) })).b;
sql(`INSERT INTO impact_certificates (id, userId, certificateCode, title, projectName, organization, hoursCompleted, peopleImpacted, status, signature, signatureAlg, verifiedByName) VALUES ('${CERT}', (SELECT id FROM users WHERE email='${A}'), '${CODE}', 'Passport UI tutor', 'Weekend maths', 'City Learning Trust', 12, 20, 'ISSUED', 'test-signature', 'EdDSA', 'Test admin')`);
const setup = { submitted: { score: submitted.score, maxScore: submitted.maxScore }, evidence: ((await call(A, '/api/passport')).b.preview?.evidence ?? []).reduce((n, g) => n + g.count, 0) };

// ── API rules ─────────────────────────────────────────────────────────────
const api = {};
api.badHandle = (await call(A, '/api/passport', { handle: 'a' }, 'PATCH')).s;
api.reserved = (await call(A, '/api/passport', { handle: 'admin' }, 'PATCH')).s;
api.badTheme = (await call(A, '/api/passport', { theme: 'neon' }, 'PATCH')).b.theme;
api.did = (await (await fetch(`${base}/.well-known/did.json`)).json()).verificationMethod?.[0]?.type;

// ── Browser helpers ───────────────────────────────────────────────────────
async function context(browser, email, { width = 390, theme = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, acceptDownloads: true });
  if (email) {
    const token = `mock-token-${email}`;
    const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
    await ctx.addInitScript(([t, user, th]) => { localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 })); localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${user.id}`, '1'); }, [token, me, theme]);
  } else {
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('universe-tour-done', '1'); }, theme);
  }
  return ctx;
}
async function axe(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const toast = async (page, text) => (await page.locator('[data-sonner-toast]', { hasText: text }).last().innerText({ timeout: 15_000 }).catch(() => 'missing')).split('\n')[0];
const downloadText = async (page, click) => {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), click()]);
  return { name: d.suggestedFilename(), bytes: readFileSync(await d.path()) };
};

const browser = await launch();
let wallet = '';

// ── The student's passport page and the CV builder ───────────────────────
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, A, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(`${new URL(page.url()).pathname}: ${e.message.slice(0, 120)}`));
  const r = { page: 'passport', theme, width };
  await page.goto(`${base}/student/passport`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('heading', { name: 'Portfolio' }).waitFor({ timeout: 20_000 });
  if (act) {
    await page.getByLabel('Your address').fill(HANDLE);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    r.handleSaved = await toast(page, 'Portfolio address saved');
    await page.getByRole('radio', { name: 'Emerald' }).click();
    await page.waitForTimeout(800);
    await page.getByRole('switch', { name: 'Public passport' }).click();
    r.madePublic = await toast(page, 'Your passport is public');
    const saved = (await call(A, '/api/passport')).b;
    r.api = { handle: saved.handle, theme: saved.theme, isPublic: saved.isPublic, portfolioUrl: saved.portfolioUrl };
    r.bobTakesSameHandle = (await call(B, '/api/passport', { handle: HANDLE }, 'PATCH')).s;
    r.linkedIn = await page.getByRole('link', { name: /Add to LinkedIn/ }).first().getAttribute('href').catch(() => 'missing');
    const w = await downloadText(page, () => page.getByRole('button', { name: /Wallet/ }).click());
    wallet = w.bytes.toString('utf8');
    r.wallet = { name: w.name, proof: JSON.parse(wallet).proof?.cryptosuite, hasInternalId: wallet.includes((await call(A, '/api/core/auth/me')).b.id) };
  }
  r.axe = await axe(page);
  r.wide = await wide(page);

  // Make my CV
  await page.getByRole('button', { name: /Make my CV/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Make my CV' });
  await sheet.getByRole('region', { name: 'CV preview' }).waitFor({ timeout: 20_000 });
  if (act) {
    await sheet.getByRole('button', { name: 'Classic' }).click();
    await sheet.getByLabel('Email or phone (optional)').fill('alice@example.com');
    await sheet.getByLabel('Impact').uncheck();
    const preview = await sheet.getByRole('region', { name: 'CV preview' }).innerText();
    r.cv = { name: preview.includes('Alice Johnson'), contact: preview.includes('alice@example.com'), evidence: preview.includes('Introduction') || preview.includes('Computer'), portfolio: preview.includes(`/p/${HANDLE}`) };
    const ai = sheet.getByRole('button', { name: /Draft with AI/ });
    await ai.click();
    r.cv.aiWithoutKey = (await page.locator('[data-sonner-toast][data-type="error"]').last().innerText({ timeout: 15_000 }).catch(() => 'missing')).split('\n')[0];
    const pdf = await downloadText(page, () => sheet.getByRole('button', { name: /Save as PDF/ }).click());
    r.cv.pdf = { name: pdf.name, isPdf: pdf.bytes.subarray(0, 5).toString() === '%PDF-', kb: Math.round(pdf.bytes.length / 1024) };
  }
  r.cvAxe = await axe(page);
  r.cvWide = await wide(page);
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}

// ── Public pages, signed out: the portfolio and the employer check ──────
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, null, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(`${new URL(page.url()).pathname}: ${e.message.slice(0, 120)}`));
  const r = { page: 'public', theme, width };
  await page.goto(`${base}/p/${HANDLE}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByText('Alice Johnson').first().waitFor({ timeout: 20_000 }).catch(() => {});
  r.portfolio = { name: await page.getByText('Alice Johnson').count() > 0, credential: await page.getByText('Passport UI tutor').count() > 0 };
  r.portfolioAxe = await axe(page);
  r.portfolioWide = await wide(page);

  await page.goto(new URL((await call(A, '/api/passport')).b.url).pathname.replace(/^/, base), { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByText('Alice Johnson').first().waitFor({ timeout: 20_000 }).catch(() => {});
  r.passportLink = { name: await page.getByText('Alice Johnson').count() > 0, emerald: await page.locator('[class*="emerald"]').count() > 0 };
  r.passportLinkAxe = await axe(page);
  r.passportLinkWide = await wide(page);

  await page.goto(`${base}/verify`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('heading', { name: 'Check a credential' }).waitFor({ timeout: 20_000 });
  if (act) {
    await page.getByLabel('Or paste its text').fill('this is not a credential');
    await page.getByRole('button', { name: 'Check it' }).click();
    r.garbage = (await page.getByRole('status').filter({ hasText: /Not valid|Genuine/ }).innerText({ timeout: 15_000 })).split('\n')[0];
    await page.locator('input[type=file]').setInputFiles({ name: 'skills.vc.json', mimeType: 'application/json', buffer: Buffer.from(wallet) });
    r.walletFile = (await page.getByRole('status').filter({ hasText: /Not valid|Genuine/ }).innerText({ timeout: 15_000 })).split('\n').slice(0, 2).join(' / ');
    const tampered = wallet.replace('"Skills with evidence"', '"Skills with evidence (edited)"');
    await page.getByLabel('Or paste its text').fill(tampered);
    await page.getByRole('button', { name: 'Check it' }).click();
    await page.waitForTimeout(800);
    r.tampered = (await page.getByRole('status').filter({ hasText: /Not valid|Genuine/ }).innerText({ timeout: 15_000 })).split('\n')[0];
  }
  r.verifyAxe = await axe(page);
  r.verifyWide = await wide(page);
  if (act) {
    await page.getByRole('textbox', { name: 'Certificate code' }).fill(CODE);
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await page.waitForURL(`**/verify/${CODE}`, { timeout: 15_000 }).catch(() => {});
    r.codeOpens = new URL(page.url()).pathname;
  }
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}

// A private passport hides the portfolio again.
await call(A, '/api/passport', { isPublic: false }, 'PATCH');
const priv = await call(null, `/api/p/${HANDLE}`);
console.log(JSON.stringify({ setup, api, privatePortfolio: priv.s }));

await browser.close();
await cleanup();
