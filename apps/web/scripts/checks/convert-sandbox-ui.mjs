// M228 (the threat model): Studio → Convert turns an HTML file with code hidden in it (an image's error handler, a
// javascript: frame) into a PDF: the PDF is made, and none of the file's code ran in the page (window.__pwned stays
// unset). Before M228 the frame that lays files out could run it. Runs against `local:serve` (or BASE=… for local:dev).
import { launch, signedIn } from '../browser-session.mjs';
const base = process.env.BASE ?? 'http://localhost:8787';
const browser = await launch();
const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
const page = await ctx.newPage();
const out = { errors: [] };
page.on('pageerror', (e) => out.errors.push(e.message.slice(0, 160)));
await page.goto(`${base}/studio?tool=convert`, { waitUntil: 'load', timeout: 180_000 });
const input = page.locator('section:has(#convert-title) input[type="file"]');
await input.waitFor({ state: 'attached', timeout: 120_000 });
const html = '<h1>Hello</h1><p>A page.</p><img src="x" onerror="top.__pwned=1"><iframe src="javascript:top.__pwned=2"></iframe><svg onload="top.__pwned=3"></svg>';
await input.setInputFiles({ name: 'trap.html', mimeType: 'text/html', buffer: Buffer.from(html) });
await page.getByRole('button', { name: /^PDF/ }).first().click();
await page.getByRole('button', { name: /trap\.pdf/ }).waitFor({ timeout: 120_000 }).then(() => { out.pdfMade = true; }).catch(() => { out.pdfMade = false; });
await page.waitForTimeout(1500);
out.ranHiddenCode = await page.evaluate(() => window.__pwned ?? null);
console.log(JSON.stringify(out, null, 2));
await browser.close();
