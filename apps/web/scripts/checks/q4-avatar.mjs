import { launch } from '../browser-session.mjs';
import { tmpdir as __tmp } from 'node:os';
const SCRATCH = __tmp();
const base = 'http://localhost:8787';
const dir = SCRATCH;
const conv = process.argv[2];
async function context(browser, email, dpr, width = 390) {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: dpr });
  await ctx.addInitScript(([t, user]) => { localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 })); localStorage.setItem('theme', 'light'); }, [token, me]);
  return ctx;
}
const browser = await launch();
{
  const ctx = await context(browser, 'alice@student.com', 1);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/student/settings?section=profile`, { waitUntil: 'networkidle', timeout: 60_000 });
  const done = page.waitForResponse((r) => /users\/me|\/api\/me/.test(r.url()) && ['PATCH', 'PUT', 'POST'].includes(r.request().method()), { timeout: 30_000 }).catch(() => null);
  await page.locator('input[type=file][accept="image/*"]').first().setInputFiles(`${dir}/IMG_4000.jpg`);
  const saved = await done;
  await page.waitForTimeout(1200);
  const av = await page.evaluate(() => [...document.querySelectorAll('img[srcset]')].map((i) => ({ srcset: i.getAttribute('srcset')?.slice(0, 80), sizes: i.getAttribute('sizes'), current: i.currentSrc.split('/api/files/')[1]?.split('/')[0] })));
  console.log(JSON.stringify({ step: 'settings', saved: saved && `${saved.request().method()} ${new URL(saved.url()).pathname} ${saved.status()}`, av, errors }));
  await ctx.close();
}
{
  const ctx = await context(browser, 'demo@student.com', 3);
  const page = await ctx.newPage();
  const loaded = []; page.on('response', (r) => { if (/\/api\/files\//.test(r.url())) loaded.push(`${new URL(r.url()).pathname.split('/')[3]} ${r.headers()['content-length'] ?? '?'} B`); });
  await page.goto(`${base}/student/inbox?c=${conv}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1500);
  const shown = await page.evaluate(() => [...document.querySelectorAll('img[srcset]')].map((i) => ({ sizes: i.getAttribute('sizes'), current: i.currentSrc.split('/api/files/')[1]?.split('/')[0], w: Math.round(i.getBoundingClientRect().width) })));
  console.log(JSON.stringify({ step: 'inbox as student, 3x phone', loaded, shown }));
  await ctx.close();
}
await browser.close();
