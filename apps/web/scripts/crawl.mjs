// Visits every page of the app as each demo role and reports what's broken.
//
//   NEXT_PUBLIC_DEMO_LOGIN=true pnpm dev -p 3100        (in another terminal)
//   node scripts/crawl.mjs [http://localhost:3100] [--only student|teacher|admin|parent] [--paths /a,/b] [--json out.json] [--phone] [--dark] [--axe]
//
// The page list comes from the app folder (every page.tsx without a [param] in its path). Each
// portal's pages are opened as its demo account (shared pages as the student). For each page it
// notes: the error screen or Next's error overlay, uncaught errors, console errors, requests that
// failed or answered 5xx, a page still showing only a skeleton after loading, and sideways scrolling.
// --phone opens every page as a phone (390 × 844, touch), --dark in dark mode, and --axe adds the
// accessibility check (axe-core, WCAG 2.2 AA, serious and critical only). --layout (the owner, 17 Nov: "check other
// area where the ui is overlapping or doesnt fit properly … in mobile") adds: parts sticking out past the screen's edge
// (not inside something that scrolls or clips), and buttons, links and fields covered by something else or overlapping
// another (checked between the top bar and the phone's tab bar). --guest opens the website's public pages signed out.
// Needs Playwright
// (see scripts/browser-session.mjs). Exits 1 when any page has a problem.

import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from './browser-session.mjs';

const base = baseUrl();
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const only = arg('--only');
const jsonOut = arg('--json');
const paths = arg('--paths')?.split(',');

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

const ROLE_OF = (path) => (path.startsWith('/teacher') ? 'teacher' : path.startsWith('/admin') ? 'admin' : path.startsWith('/parent') ? 'parent' : 'student');
// The parent is a local test account (scripts/local/serve.mjs signs it in, here only).
const EMAIL = { student: 'demo@student.com', teacher: 'demo@teacher.com', admin: 'demo@admin.com', parent: 'test-parent@local.test' };
const phone = process.argv.includes('--phone');
const dark = process.argv.includes('--dark');
const withAxe = process.argv.includes('--axe');
const layout = process.argv.includes('--layout');
const guest = process.argv.includes('--guest');
const AXE = withAxe ? createRequire(import.meta.url).resolve('axe-core/axe.min.js') : null;
// The owner console needs the owner account; sign-in and sign-up pages redirect when signed in.
const SKIP = [/^\/console/, /^\/(login|register|forgot-password|reset-password)$/];
// Expected under `next dev`: live updates need the Durable Objects, which only run in wrangler.
const IGNORE = [/\/api\/realtime\/ticket$/];
const ignored = (url) => { try { return IGNORE.some((re) => re.test(new URL(url).pathname)); } catch { return false; } };

// --paths: just those (pages with an id in them too, e.g. /student/courses/<id>).
const PUBLIC = ['/', '/login', '/register', '/forgot-password', '/t/demo', '/privacy', '/terms'];
const all = paths ?? (guest ? PUBLIC : routes().filter((r) => !SKIP.some((re) => re.test(r))));
const byRole = guest ? { guest: all } : Object.groupBy(all, ROLE_OF);
const browser = await launch();
const results = [];
for (const [role, pages] of Object.entries(byRole)) {
  if (only && only !== role) continue;
  const ctx = role === 'guest'
    ? await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1366, height: 900 }, ...(phone ? { isMobile: true, hasTouch: true } : {}) })
    : await signedIn(browser, base, EMAIL[role], phone ? { width: 390, height: 844 } : undefined, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript(() => { try { localStorage.setItem('uv-cookies', 'essential'); } catch { /* none */ } });
  await ctx.addInitScript((d) => localStorage.setItem('theme', d ? 'dark' : 'light'), dark);
  for (const path of pages) {
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(`error: ${String(e.message).slice(0, 140)}`));
    page.on('console', (m) => { if (m.type() === 'error' && !ignored(m.location().url ?? '') && !/favicon|Download the React DevTools|\[HMR\]|net::ERR_ABORTED/.test(m.text())) problems.push(`console: ${m.text().slice(0, 140)}`); });
    page.on('response', (r) => { if (r.status() >= 500 && !ignored(r.url())) problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
    page.on('requestfailed', (r) => { const f = r.failure()?.errorText ?? ''; if (!/ERR_ABORTED|NS_BINDING_ABORTED/.test(f) && !r.url().includes('/_next/webpack-hmr')) problems.push(`failed: ${new URL(r.url()).pathname} ${f}`); });
    try {
      // Generous: the dev server compiles a page on its first visit (20 s or more).
      await page.goto(base + path, { waitUntil: 'load', timeout: 120_000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const state = await page.evaluate(() => ({
        // Next's dev badge is always there; it's red (data-error) when the page has an error.
        overlay: (() => { const root = document.querySelector('nextjs-portal')?.shadowRoot; return !!root && (root.querySelector('[data-next-badge]')?.getAttribute('data-error') === 'true' || !!root.querySelector('[data-nextjs-dialog]')); })(),
        errorScreen: /We’ve been told about it automatically|Something went wrong on our side/.test(document.body.innerText),
        onlySkeleton: !!document.querySelector('main .skeleton') && (document.querySelector('main')?.innerText.trim().length ?? 0) < 20,
        wide: document.documentElement.scrollWidth > window.innerWidth + 1,
      }));
      if (state.overlay) problems.unshift('Next error overlay');
      if (state.errorScreen) problems.unshift('error screen');
      if (state.onlySkeleton) problems.push('still loading (only a skeleton) after load');
      if (state.wide) problems.push('scrolls sideways');
      if (layout) {
        await page.waitForFunction(() => !document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
        problems.push(...await page.evaluate(() => {
          const out = [], W = window.innerWidth, H = window.innerHeight;
          const name = (el) => { const t = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40); return `${el.tagName.toLowerCase()} "${t}"`; };
          const shown = (el) => { const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
          // Inside something that scrolls sideways or clips: sticking out there is meant.
          const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox !== 'visible') return true; } return false; };
          const wide = [];
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > H * 3) continue;
            // Crossing the screen's edge (a drawer waiting wholly off the screen isn't).
            if (((r.right > W + 2 && r.left < W) || (r.left < -2 && r.right > 0)) && shown(el) && !clipped(el) && getComputedStyle(el).position !== 'fixed') wide.push(el);
          }
          // Only the outermost of each (its children stick out with it).
          for (const el of wide.filter((e) => !wide.some((o) => o !== e && o.contains(e))).slice(0, 4)) { const r = el.getBoundingClientRect(); out.push(`sticks out ${Math.round(Math.max(r.right - W, -r.left))} px: ${name(el)}`); }
          const ctl = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=radio]')].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width >= 8 && r.height >= 8 && r.top >= 76 && r.bottom <= H - 96 && r.left >= 0 && r.right <= W && shown(el) && getComputedStyle(el).pointerEvents !== 'none';
          });
          const covered = [];
          for (const el of ctl) {
            const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (!hit || el.contains(hit) || hit.contains(el) || hit.closest('label')?.contains(el)) continue;
            if (hit.closest('[role=dialog], [aria-modal=true]') && !el.closest('[role=dialog], [aria-modal=true]')) continue; // a sheet open on purpose
            covered.push(`${name(el)} covered by ${name(hit)}`);
          }
          out.push(...covered.slice(0, 4));
          const pairs = [];
          for (let i = 0; i < ctl.length && pairs.length < 4; i++) for (let j = i + 1; j < ctl.length; j++) {
            const a = ctl[i], b = ctl[j];
            if (a.contains(b) || b.contains(a)) continue;
            // A button placed inside a field on purpose (show the password, clear, search): not an overlap.
            const inField = (x, y) => /^(INPUT|TEXTAREA|SELECT)$/.test(x.tagName) && getComputedStyle(y).position === 'absolute';
            if (inField(a, b) || inField(b, a)) continue;
            const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
            const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
            if (w > 4 && h > 4 && w * h > 0.25 * Math.min(ra.width * ra.height, rb.width * rb.height)) { pairs.push(`${name(a)} overlaps ${name(b)}`); break; }
          }
          out.push(...pairs);
          return out;
        }));
      }
      if (AXE) {
        // Let entrance animations finish first (rows mid-fade read as low contrast).
        await page.waitForFunction(() => !document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(300);
        await page.addScriptTag({ path: AXE });
        const found = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `axe ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
        problems.push(...found);
      }
    } catch (e) {
      problems.unshift(`did not load: ${String(e.message).split('\n')[0].slice(0, 120)}`);
    }
    results.push({ role, path, problems: [...new Set(problems)] });
    if (process.argv.includes('--stream')) console.log(`${problems.length ? 'PROBLEM' : 'ok'} ${path} (${role})${problems.length ? `\n  - ${[...new Set(problems)].slice(0, 6).join('\n  - ')}` : ''}`);
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
