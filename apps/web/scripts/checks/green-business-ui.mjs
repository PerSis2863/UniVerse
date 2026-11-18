// M269–M275 on the built Worker: Green → Business end to end. A demo student starts a company over the API, adds
// lines and an import, asks a supplier, makes the staff survey and auditor links; then in the browser: every section at
// 1280 light and 390 dark (axe serious/critical, no sideways scroll, no page errors); the supplier's form, the commute
// survey and the auditor's report on /carbon/[code] filled in as a visitor; the supplier's share lands in scope 3, the
// survey's in commuting, and the log stays whole. Run while `pnpm local:serve` runs: node scripts/checks/green-business-ui.mjs [base]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl().replace('3100', '8787');
const fail = [], out = [];
const H = { Authorization: 'Bearer mock-token-demo@student.com', 'Content-Type': 'application/json' };
const call = async (method, path, body) => {
  const r = await fetch(`${base}/api/core${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
};
const year = new Date().getFullYear();

const { id } = await call('POST', '/green/biz', { name: `Check Co ${Date.now()}`, country: 'IN', currency: 'INR', employees: 50, revenue: 100_000_000, industry: 'Textiles' });
await call('POST', `/green/biz/${id}/entries`, { period: `${year}-01`, category: 'electricity', quantity: 10_000 });
await call('POST', `/green/biz/${id}/entries/batch`, { rows: [{ period: `${year}-02`, category: 'diesel', quantity: 300 }, { period: `${year}-02`, category: 'flight-short', quantity: 4000, note: 'DEL-BOM' }] });
const sup = await call('POST', `/green/biz/${id}/suppliers`, { name: 'Check Cotton', spend: 1_000_000, year });
const { surveyCode } = await call('POST', `/green/biz/${id}/survey`, { on: true });
const { auditCode } = await call('POST', `/green/biz/${id}/audit-link`, { on: true });
const before = await call('GET', `/green/biz/${id}?year=${year}`);
if (Math.round(before.totals.scope[2]) !== 7160) fail.push(`electricity in India should be 7,160 kg, got ${before.totals.scope[2]}`);

const browser = await launch();
try {
  for (const [width, theme] of [[1280, 'light'], [390, 'dark']]) {
    const ctx = await signedIn(browser, base, 'demo@student.com', { width, height: 900 }, width < 600 ? { isMobile: true, hasTouch: true } : {});
    await ctx.addInitScript(([t, org]) => { try { localStorage.setItem('theme', t); localStorage.setItem('uv-green-biz', org); } catch { /* fine */ } }, [theme, id]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => fail.push(`${width} ${theme}: ${e.message}`));
    for (const b of ['overview', 'ledger', 'suppliers', 'staff', 'planner', 'report', 'log']) {
      const what = `${b} ${width} ${theme}`;
      await page.goto(`${base}/green?view=business&b=${b}`, { waitUntil: 'load', timeout: 240_000 });
      await page.getByRole('group', { name: 'Section' }).waitFor({ timeout: 60_000 }).catch(() => fail.push(`${what}: no sections`));
      await page.waitForTimeout(2200);
      const want = { overview: /Footprint \d{4}/, ledger: /Electricity from the grid/, suppliers: /Check Cotton/, staff: /Copy the survey link/, planner: /What if/, report: /BRSR, Principle 6/, log: /The log is whole/ }[b];
      if (!(await page.getByText(want).first().isVisible().catch(() => false))) fail.push(`${what}: didn't show ${want}`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) fail.push(`${what}: scrolls sideways`);
      await page.addScriptTag({ path: AXE });
      const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
      for (const x of bad) fail.push(`${what} axe ${x}`);
      if (b === 'overview' || b === 'report') await page.screenshot({ path: `${process.env.SHOTS ?? '/tmp'}/green-biz-${b}-${width}-${theme}.png`, fullPage: b === 'report' });
    }
    await ctx.close();
  }

  // The share links, as a visitor without an account.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail.push(`share links: ${e.message}`));
  await page.goto(`${base}/carbon/${sup.code}`, { waitUntil: 'load', timeout: 120_000 });
  await page.getByLabel(/^Scope 1/).fill('50');
  await page.getByLabel(/^Scope 2/).fill('50');
  await page.getByLabel(/^Total revenue/).fill('10000000');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByText(/Sent\. You can correct it/).waitFor({ timeout: 20_000 }).catch(() => fail.push('the supplier form didn’t confirm'));
  await page.goto(`${base}/carbon/${surveyCode}`, { waitUntil: 'load', timeout: 120_000 });
  await page.getByLabel(/^Distance one way/).fill('12');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByText('Thank you').waitFor({ timeout: 20_000 }).catch(() => fail.push('the survey didn’t thank'));
  for (const [what, code] of [['supplier', sup.code], ['audit', auditCode]]) {
    await page.goto(`${base}/carbon/${code}`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(1500);
    if (what === 'audit' && !(await page.getByText(/Whole: every row/).isVisible().catch(() => false))) fail.push('the auditor’s page doesn’t say the log is whole');
    const html = await page.content();
    if (/@[a-z0-9-]+\.[a-z]/i.test(html.replace(/https?:\/\/[^\s"']+/g, ''))) fail.push(`${what} page shows an email address`);
    await page.addScriptTag({ path: AXE });
    const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id));
    for (const x of bad) fail.push(`/carbon ${what} axe ${x}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) fail.push(`/carbon ${what} scrolls sideways`);
  }
  await ctx.close();
} finally {
  await browser.close();
}

const after = await call('GET', `/green/biz/${id}?year=${year}`);
const s3 = after.totals.byCategory;
if (!(Math.round(s3.supplier ?? 0) === 10_000)) fail.push(`the supplier's share should be 10,000 kg (1M of 10M revenue × 100 t), got ${s3.supplier}`);
if (!(s3.commute > 0)) fail.push('the commute answer didn’t make a commuting line');
const audit = await call('GET', `/green/biz/${id}/audit`);
if (!audit.whole) fail.push('the log isn’t whole');
out.push(`company ${id}: ${Math.round(after.totals.kg)} kg, log ${audit.count} rows`);
await call('DELETE', `/green/biz/${id}`);

console.log(out.join('\n'));
if (fail.length) { console.log(`\n${fail.length} problem(s):\n${fail.join('\n')}`); process.exit(1); }
console.log('green-business-ui: all good');
