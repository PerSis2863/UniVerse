// Visits every page of the app as each demo role and reports what's broken.
//
//   NEXT_PUBLIC_DEMO_LOGIN=true pnpm dev -p 3100        (in another terminal)
//   node scripts/crawl.mjs [http://localhost:3100] [--only student|teacher|admin] [--json out.json]
//
// The page list comes from the app folder (every page.tsx without a [param] in its path). Each
// portal's pages are opened as its demo account (shared pages as the student). For each page it
// notes: the error screen or Next's error overlay, uncaught errors, console errors, requests that
// failed or answered 5xx, and a page still showing only a skeleton after loading. Needs Playwright
// (see scripts/browser-session.mjs). Exits 1 when any page has a problem.

import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { baseUrl, launch, signedIn } from './browser-session.mjs';

const base = baseUrl();
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const only = arg('--only');
const jsonOut = arg('--json');

/** Every static page route under src/app (route groups dropped, dynamic routes skipped). */
function routes(dir = new URL('../src/app', import.meta.url).pathname, root = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'api' || name.startsWith('_') || name.startsWith('@')) continue;
      routes(p, root, out);
    } else if (name === 'page.tsx') {
      const parts = relative(root, dir).split(sep).filter((s) => s && !(s.startsWith('(') && s.endsWith(')')));
      if (!parts.some((s) => s.includes('['))) out.push('/' + parts.join('/'));
    }
  }
  return out.sort();
}

const ROLE_OF = (path) => (path.startsWith('/teacher') ? 'teacher' : path.startsWith('/admin') ? 'admin' : 'student');
const EMAIL = { student: 'demo@student.com', teacher: 'demo@teacher.com', admin: 'demo@admin.com' };
// The owner console needs the owner account; sign-in and sign-up pages redirect when signed in.
const SKIP = [/^\/console/, /^\/(login|register|forgot-password|reset-password)$/];

const all = routes().filter((r) => !SKIP.some((re) => re.test(r)));
const byRole = Object.groupBy(all, ROLE_OF);
const browser = await launch();
const results = [];
for (const [role, pages] of Object.entries(byRole)) {
  if (only && only !== role) continue;
  const ctx = await signedIn(browser, base, EMAIL[role]);
  for (const path of pages) {
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(`error: ${String(e.message).slice(0, 140)}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Download the React DevTools|\[HMR\]|net::ERR_ABORTED/.test(m.text())) problems.push(`console: ${m.text().slice(0, 140)}`); });
    page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
    page.on('requestfailed', (r) => { const f = r.failure()?.errorText ?? ''; if (!/ERR_ABORTED|NS_BINDING_ABORTED/.test(f) && !r.url().includes('/_next/webpack-hmr')) problems.push(`failed: ${new URL(r.url()).pathname} ${f}`); });
    try {
      await page.goto(base + path, { waitUntil: 'load', timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const state = await page.evaluate(() => ({
        overlay: !!document.querySelector('nextjs-portal'),
        errorScreen: /We’ve been told about it automatically|Something went wrong on our side/.test(document.body.innerText),
        onlySkeleton: !!document.querySelector('main .skeleton') && (document.querySelector('main')?.innerText.trim().length ?? 0) < 20,
      }));
      if (state.overlay) problems.unshift('Next error overlay');
      if (state.errorScreen) problems.unshift('error screen');
      if (state.onlySkeleton) problems.push('still loading (only a skeleton) after load');
    } catch (e) {
      problems.unshift(`did not load: ${String(e.message).split('\n')[0].slice(0, 120)}`);
    }
    results.push({ role, path, problems: [...new Set(problems)] });
    await page.close();
  }
  await ctx.close();
}
await browser.close();

const bad = results.filter((r) => r.problems.length);
for (const r of bad) {
  console.log(`\n${r.path}  (${r.role})`);
  for (const p of r.problems.slice(0, 6)) console.log(`  - ${p}`);
}
console.log(`\n${results.length - bad.length}/${results.length} pages clean`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1));
process.exitCode = bad.length ? 1 : 0;
