import { launch } from '../browser-session.mjs';
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
async function context(browser, email) {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(([t, user]) => { localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 })); localStorage.setItem('theme', 'light'); }, [token, me]);
  return ctx;
}
const browser = await launch();
for (const [who, title] of [['demo@teacher.com', 'How do I stop an infinite loop?'], ['alice@student.com', 'Is the quiz open book?'], ['bob@student.com', 'Is the quiz open book?']]) {
  const ctx = await context(browser, who);
  const page = await ctx.newPage();
  await page.goto(`${base}/${who.includes('teacher') ? 'teacher' : 'student'}/blackboard?course=${C}&tab=discussion`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(title.replace('?', '\\?')) }).first().click();
  await page.getByRole('heading', { name: title }).waitFor({ timeout: 15_000 });
  const info = await page.evaluate(() => ({
    author: document.querySelector('article .inline-flex.items-center.gap-2.min-w-0')?.textContent,
    draft: [...document.querySelectorAll('button')].some((b) => /Draft an answer with AI/.test(b.textContent ?? '')),
    hideBox: [...document.querySelectorAll('label')].some((l) => /Hide my name/.test(l.textContent ?? '')),
    closed: /closed to new replies|Closed to replies/i.test(document.body.textContent ?? ''),
  }));
  console.log(who, JSON.stringify(info));
  await ctx.close();
}
await browser.close();
