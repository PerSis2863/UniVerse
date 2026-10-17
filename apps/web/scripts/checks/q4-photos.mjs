// Q4 check on the built Worker: a chat photo uploads in three sizes and phones load a smaller one.
import { launch } from '../browser-session.mjs';
import { writeFileSync } from 'node:fs';

import { tmpdir as __tmp } from 'node:os';
const SCRATCH = __tmp();
const base = 'http://localhost:8787';
const conv = process.argv[2];
const dir = SCRATCH;

async function context(browser, email, dpr, width = 390, theme = 'light') {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: dpr });
  await ctx.addInitScript(([t, user, th]) => {
    localStorage.setItem('accessToken', t);
    localStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 }));
    localStorage.setItem('theme', th);
  }, [token, me, theme]);
  return ctx;
}

const browser = await launch();
// 1) A 4000×3000 phone-sized photo, made in the browser.
{
  const ctx = await context(browser, 'alice@student.com', 1);
  const page = await ctx.newPage();
  await page.goto(base + '/offline', { waitUntil: 'load' }).catch(() => {});
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
    const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 4000, 3000);
    g.addColorStop(0, '#4f46e5'); g.addColorStop(1, '#f59e0b'); x.fillStyle = g; x.fillRect(0, 0, 4000, 3000);
    for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${i * 7} 70% 50%)`; x.beginPath(); x.arc((i * 997) % 4000, (i * 571) % 3000, 40 + (i % 60), 0, 7); x.fill(); }
    return c.toDataURL('image/jpeg', 0.92).split(',')[1];
  });
  writeFileSync(`${dir}/IMG_4000.jpg`, Buffer.from(b64, 'base64'));
  await ctx.close();
}

// 2) Alice sends it in the chat.
{
  const ctx = await context(browser, 'alice@student.com', 1);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const uploads = [];
  page.on('response', (r) => { if (r.url().includes('/api/upload')) uploads.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`); });
  await page.goto(`${base}/student/inbox?c=${conv}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.locator('input[type=file][accept="image/*,video/*"]').setInputFiles(`${dir}/IMG_4000.jpg`);
  await page.waitForResponse((r) => r.url().includes('/api/chat/conversations/') && r.request().method() === 'POST', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const img = await page.evaluate(() => [...document.querySelectorAll('img[srcset]')].map((i) => ({ src: i.getAttribute('src'), srcset: i.getAttribute('srcset'), sizes: i.getAttribute('sizes'), current: i.currentSrc, w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height })));
  console.log(JSON.stringify({ step: 'sent', uploads, img, errors }, null, 1));
  await ctx.close();
}

// 3) The student opens the chat on a phone (3× screen) and a laptop (1×): which size loads?
for (const [dpr, width] of [[3, 390], [1, 390], [2, 1280]]) {
  const ctx = await context(browser, 'demo@student.com', dpr, width);
  const page = await ctx.newPage();
  const loaded = [];
  page.on('response', (r) => { if (/\/api\/files\//.test(r.url())) loaded.push(`${new URL(r.url()).pathname.split('/')[3]} ${r.headers()['content-length'] ?? '?'} B`); });
  await page.goto(`${base}/student/inbox?c=${conv}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1500);
  const shown = await page.evaluate(() => [...document.querySelectorAll('img[srcset]')].map((i) => ({ current: i.currentSrc.split('/api/files/')[1]?.split('/')[0], w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height), natural: i.naturalWidth })));
  console.log(JSON.stringify({ step: 'viewer', dpr, width, loaded, shown }));
  await ctx.close();
}
await browser.close();
