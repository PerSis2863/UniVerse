// Layout shift (CLS) on the main pages, measured in a real browser.
//
//   NEXT_PUBLIC_DEMO_LOGIN=true pnpm dev -p 3100        (in another terminal)
//   node scripts/cls.mjs [http://localhost:3100] [--json out.json]
//
// Signs in as each demo role (mock token, so only with demo login on), opens each page on a phone
// screen and on a desktop, waits for it to settle, and sums the layout-shift entries that weren't
// caused by input (the Web Vitals CLS definition, without session windows: stricter). Target: < 0.05.
// Needs Playwright (globally installed, or `pnpm add -D playwright`); uses PLAYWRIGHT_BROWSERS_PATH.

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch { /* not local */ }
  const globalRoot = execSync('npm root -g').toString().trim();
  return require(`${globalRoot}/playwright`);
}
const { chromium } = loadPlaywright();

const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3100';
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;

const PAGES = {
  'demo@student.com': ['/student', '/student/courses', '/student/assignments', '/student/quizzes', '/student/grades', '/student/attendance', '/student/inbox', '/student/calendar', '/student/skills', '/student/internships', '/student/planner', '/tasks', '/docs'],
  'demo@teacher.com': ['/teacher', '/teacher/courses', '/teacher/grades', '/teacher/attendance', '/teacher/students', '/teacher/quizzes'],
  'demo@admin.com': ['/admin', '/admin/users', '/admin/finances', '/admin/announcements', '/admin/analytics'],
};
const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1366, height: 900 } };

// Sum of layout shifts not caused by input, from the start of the page load.
const OBSERVE = () => {
  window.__cls = 0;
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__cls += e.value;
      window.__shifts.push({ value: +e.value.toFixed(4), nodes: (e.sources || []).map((s) => s.node && (s.node.id ? `#${s.node.id}` : `${s.node.nodeName.toLowerCase()}.${String(s.node.className || '').split(' ').slice(0, 3).join('.')}`)).filter(Boolean) });
    }
  }).observe({ type: 'layout-shift', buffered: true });
};

const browser = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: '/opt/pw-browsers/chromium' });
const results = [];
for (const [email, pages] of Object.entries(PAGES)) {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
    await ctx.addInitScript(([t, user]) => {
      localStorage.setItem('accessToken', t);
      localStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 }));
    }, [token, me]);
    await ctx.addInitScript(OBSERVE);
    for (const path of pages) {
      const page = await ctx.newPage();
      try {
        await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60_000 });
        await page.waitForTimeout(1500); // late data, fonts, images
        const { cls, shifts } = await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts }));
        results.push({ role: email.split('@')[1].split('.')[0], path, vp, cls: +cls.toFixed(4), shifts: shifts.filter((s) => s.value >= 0.005) });
      } catch (e) {
        results.push({ role: email, path, vp, cls: null, error: String(e.message).slice(0, 120) });
      }
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();

results.sort((a, b) => (b.cls ?? 1) - (a.cls ?? 1));
for (const r of results) {
  const flag = r.cls == null ? 'ERR ' : r.cls >= 0.05 ? 'FAIL' : 'ok  ';
  console.log(`${flag} ${String(r.cls ?? '-').padEnd(7)} ${r.vp.padEnd(8)} ${r.path}${r.error ? `  ${r.error}` : ''}`);
  if (r.cls >= 0.05) for (const s of r.shifts.slice(0, 4)) console.log(`       ${s.value}  ${s.nodes.join(' ')}`);
}
const bad = results.filter((r) => r.cls == null || r.cls >= 0.05).length;
console.log(`\n${results.length - bad}/${results.length} under 0.05`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1));
process.exitCode = bad ? 1 : 0;
