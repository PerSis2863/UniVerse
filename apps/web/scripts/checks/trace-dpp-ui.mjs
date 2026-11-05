// M108 the EU Digital Product Passport, in the browser (against `pnpm local:dev` on :3000 or the built
// Worker: pass its address). Alice's brand (started if she has none) gets a product with a GTIN and a
// passport; a wrong check digit is refused; GS1 Digital Link addresses lead to the unit's page and the
// product's page; the public JSON holds the passport and no email address; a supplier answers from a
// link without an account and the brand adds it; the pages (/dpp, /t/<code>, /supply, the console's
// editor) at 390 and 1280 px, light and dark, axe (serious/critical), no sideways scrolling, no page
// errors. Removes what it made.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3000';
const A = 'alice@student.com';
const H = (e) => ({ ...(e && { Authorization: `Bearer mock-token-${e}` }), 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => {
  const r = await fetch(`${base}/api/core${path}`, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, b: await r.json().catch(() => ({})) };
};
const sql = (command) => execSync(`npx wrangler d1 execute universe-db --local --command "${command.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: 'ignore' });
let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log(`FAIL ${what}`); } };
const digit = (b) => { let s = 0; for (let i = 0; i < b.length; i++) s += Number(b[b.length - 1 - i]) * (i % 2 === 0 ? 3 : 1); return (10 - (s % 10)) % 10; };
const GTIN = '0952099887766' + digit('0952099887766'); // GS1 keeps prefix 952 for examples
const NAME = 'DPP UI Linen Shirt';

sql(`DELETE FROM trace_products WHERE name = '${NAME}' OR gtin = '${GTIN}'`);
const had = (await call(A, '/trace/brand')).b.brand;
if (!had) check((await call(A, '/trace/brand', { name: 'DPP UI Brand' })).s === 201, 'start a brand');

// ── The rules, through the API ──────────────────────────────────────────────────────────────
const product = await call(A, '/trace/products', { name: NAME, category: 'clothing', description: '100% European linen.' });
check(product.s === 201, `add a product (${product.s})`);
const pid = product.b.id;
check((await call(A, `/trace/products/${pid}/dpp`, { gtin: GTIN.slice(0, 13) + ((Number(GTIN[13]) + 1) % 10), dpp: {} }, 'PUT')).s === 400, 'a wrong check digit is refused');
const saved = await call(A, `/trace/products/${pid}/dpp`, { gtin: GTIN, dpp: {
  madeIn: 'Portugal', manufacturer: { name: 'DPP UI Textiles Lda', address: 'Rua das Flores 1, Porto', website: 'https://example.com' },
  materials: [{ name: 'Linen', percent: 100, recycled: 0, origin: 'France' }], carbonKg: 3.2, carbonMethod: 'PEF', recycledContent: 0, recyclable: 90,
  durabilityYears: 6, repairScore: 7.5, care: 'Wash at 40 °C. Line dry.', endOfLife: 'Give it to a textile collection point.', certifications: ['European Flax'],
  documents: [{ title: 'Declaration of conformity', url: 'https://example.com/doc.pdf' }],
} }, 'PUT');
check(saved.s === 200 && saved.b.score?.done >= 8, `save the passport (${saved.s}, ${saved.b.score?.done})`);
const batch = await call(A, `/trace/products/${pid}/batches`, { quantity: 3, origin: 'Porto, Portugal' });
check(batch.s === 201, 'make a batch');
const codes = await call(A, `/trace/batches/${batch.b.id}/codes?from=0&count=3`);
check(codes.b.batch?.gtin === GTIN, 'the print sheet knows the GTIN (GS1 Digital Link QR codes)');
const code = codes.b.codes?.[0]?.code;

const hop = async (path) => { const r = await fetch(base + path, { redirect: 'manual' }); return r.headers.get('location') ?? ''; };
check((await hop(`/01/${GTIN}/21/${code}`)).endsWith(`/t/${code}`), 'GS1 Digital Link with a serial opens the unit');
check((await hop(`/01/${GTIN.slice(1)}/10/LOT1`)).includes(`/dpp?g=${GTIN}&lot=LOT1`), 'GS1 Digital Link without one opens the product');
const pub = await call(null, `/trace/dpp/${GTIN}`);
check(pub.s === 200 && pub.b.dpp?.materials?.[0]?.name === 'Linen', 'the passport as public JSON');
check(!JSON.stringify(pub.b).includes('@'), 'no email address in the public passport');

const ask = await call(A, `/trace/products/${pid}/supply`, { supplier: 'DPP UI Buttons', asks: 'Shell buttons' });
check(ask.s === 201 && /\/supply\?k=[0-9A-Z]{32}$/.test(ask.b.link ?? ''), 'a supplier link');
const k = new URL(ask.b.link, base).searchParams.get('k');
check((await call(null, `/trace/supplier?k=${k}`)).b.asks === 'Shell buttons', 'the supplier sees what is asked');
check((await call(null, '/trace/supplier?k=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).s === 404, 'a made-up link is refused');

// ── The pages ───────────────────────────────────────────────────────────────────────────────
const browser = await launch();
const axe = async (page, what) => {
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  check(bad.length === 0, `${what}: axe ${bad.join('; ')}`);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(wide <= 1, `${what}: no sideways scrolling (${wide}px)`);
};
for (const [w, h] of [[390, 844], [1280, 900]]) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await signedIn(browser, base, A, { width: w, height: h }, { colorScheme: scheme });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const at = `${w} ${scheme}`;
    await page.goto(`${base}/dpp?g=${GTIN}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.getByRole('heading', { name: 'Digital Product Passport' }).waitFor({ timeout: 60_000 });
    await axe(page, `/dpp ${at}`);
    await page.goto(`${base}/t/${code}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.getByRole('heading', { name: 'Digital Product Passport' }).waitFor({ timeout: 60_000 }).catch(() => check(false, `/t shows the passport ${at}`));
    await axe(page, `/t ${at}`);
    await page.goto(`${base}/supply?k=${k}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.getByRole('textbox', { name: 'Material or part' }).waitFor({ timeout: 60_000 });
    await axe(page, `/supply ${at}`);
    if (w === 1280 && scheme === 'light') {
      await page.getByRole('textbox', { name: 'Where it’s made or grown' }).fill('Douro, Portugal');
      await page.getByRole('spinbutton', { name: 'Recycled content (%)' }).fill('30');
      await page.getByRole('button', { name: /^Send to/ }).click();
      await page.getByRole('heading', { name: 'Thank you' }).waitFor({ timeout: 20_000 }).catch(() => check(false, 'the supplier sends an answer'));
    }
    await page.goto(`${base}/trace`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.getByRole('button', { name: /^Digital Product Passport/ }).first().waitFor({ timeout: 60_000 });
    const opener = page.locator('article', { hasText: NAME }).getByRole('button', { name: /^Digital Product Passport/ });
    await opener.click();
    await page.getByRole('textbox', { name: 'GTIN (the number under its barcode)' }).waitFor({ timeout: 30_000 });
    check(await page.getByRole('textbox', { name: 'GTIN (the number under its barcode)' }).inputValue() === GTIN, `the editor shows the GTIN ${at}`);
    await axe(page, `editor ${at}`);
    check(errors.length === 0, `${at}: page errors ${errors.join(' | ')}`);
    await ctx.close();
  }
}
await browser.close();

const reqs = await call(A, `/trace/products/${pid}/supply`);
const answered = (reqs.b ?? []).find((r) => r.status === 'ANSWERED');
check(answered?.answer?.material?.origin === 'Douro, Portugal', 'the brand sees the answer');
const used = answered ? await call(A, `/trace/supply/${answered.id}/use`, {}) : { b: {} };
check(used.b.dpp?.materials?.some((m) => m.name === 'Shell buttons' && m.recycled === 30), 'the answer goes into the passport');

await call(A, `/trace/products/${pid}`, null, 'DELETE');
if (!had) sql(`DELETE FROM trace_brands WHERE name = 'DPP UI Brand'`);
sql(`DELETE FROM notifications WHERE title LIKE 'DPP UI%'`);
console.log(failures ? `${failures} failed` : 'trace-dpp-ui: all passed');
process.exit(failures ? 1 : 0);
