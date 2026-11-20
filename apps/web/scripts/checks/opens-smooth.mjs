// M355 (the owner, 20 Nov: "make sure every button when click and opened something it has smooth animations"): on the
// main pages of every app, as a student and a teacher, on a phone (390 × 844) and a computer (1280 × 860), presses each
// button that opens something (a menu, a drop-down, a section: aria-haspopup, aria-expanded, aria-controls, "More …")
// and looks at what appeared in the next 1.5 s: did it move in (its own animation, the motion layer's, framer-motion),
// or did it just appear ("still")? Lists the still ones, page by page. Run against `pnpm local:serve` (the built site):
//   node scripts/checks/opens-smooth.mjs [base] [--phone-only | --computer-only] [--only <path>]
import { launch, signedIn } from '../browser-session.mjs';

const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:8787';
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const sizes = [['phone', 390, 844], ['computer', 1280, 860]].filter(([n]) => !(process.argv.includes('--phone-only') && n !== 'phone') && !(process.argv.includes('--computer-only') && n !== 'computer'));
const PAGES = {
  'alice@student.com': ['/student', '/student/inbox', '/student/calendar', '/student/courses', '/student/grades', '/student/settings', '/calls', '/hub', '/trace', '/relief', '/green', '/travel', '/play'],
  'tara@teacher.com': ['/teacher', '/teacher/courses', '/teacher/grades', '/teacher/attendance', '/teacher/calendar'],
};
const OPENERS = 'button[aria-haspopup]:not([disabled]), button[aria-expanded="false"]:not([disabled]), button[aria-controls]:not([disabled]), button[aria-label^="More"]:not([disabled])';

// In the page: what appeared after a press, and whether each part moved in (two frames after it arrived, when the motion
// layer has started its animation, or its own CSS / framer-motion / WAAPI one has).
const watch = () => {
  window.__seen = [];
  window.__watch?.disconnect();
  const moving = (el) => {
    for (let p = el, up = 0; p && p !== document.body && up < 7; p = p.parentElement, up++) {
      if (p.getAnimations().length || p.style.opacity !== '' || (p.style.transform && p.style.transform !== 'none')) return true;
    }
    return false;
  };
  window.__watch = new MutationObserver((rs) => {
    for (const r of rs) for (const n of r.addedNodes) {
      if (!(n instanceof HTMLElement) || n.closest('[data-no-motion], [data-sonner-toaster]')) continue;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!n.isConnected) return;
        const b = n.getBoundingClientRect();
        if (b.height < 24 || b.width < 24 || b.bottom < 0 || b.top > innerHeight) return;
        window.__seen.push({ what: `${n.tagName.toLowerCase()}${n.getAttribute('role') ? `[${n.getAttribute('role')}]` : ''} ${Math.round(b.width)}×${Math.round(b.height)}`, moved: moving(n) });
      }));
    }
  });
  window.__watch.observe(document.body, { childList: true, subtree: true });
};

const out = [];
const browser = await launch();
for (const [who, pages] of Object.entries(PAGES)) {
  for (const [size, w, h] of sizes) {
    const ctx = await signedIn(browser, base, who, { width: w, height: h }, size === 'phone' ? { isMobile: true, hasTouch: true } : {});
    await ctx.addInitScript(() => { localStorage.setItem('uv-cookies', 'essential'); localStorage.setItem('uv-push-asked', '1'); });
    const page = await ctx.newPage();
    for (const path of pages.filter((p) => !only || p === only)) {
      await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(4000);
      // Each round marks the openers on screen again (a press may redraw the page) and presses the next one by its name.
      const mark = () => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0; })
        .map((b, i) => { b.setAttribute('data-opens-test', String(i)); return (b.getAttribute('aria-label') || b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40); }), OPENERS);
      const labels = [...new Set((await mark()).filter(Boolean))].slice(0, 10);
      for (const label of labels) {
        const i = (await mark()).indexOf(label);
        if (i < 0) continue;
        const button = page.locator(`[data-opens-test="${i}"]`).first();
        await page.evaluate(watch);
        const before = page.url();
        try { await button.click({ timeout: 2500 }); } catch { continue; }
        // A part that was there all along and slides or fades in (the phone's side menu): a transition just after the press.
        await page.waitForTimeout(120);
        const slid = await page.evaluate(() => document.getAnimations().some((x) => x instanceof CSSTransition && /^(transform|translate|opacity)$/.test(x.transitionProperty)));
        await page.waitForTimeout(1380);
        const seen = await page.evaluate(() => window.__seen);
        const still = seen.filter((s) => !s.moved);
        const status = page.url() !== before ? 'went to another page' : !seen.length ? (slid ? 'slid in' : 'nothing appeared') : still.length ? `STILL: ${still.slice(0, 2).map((s) => s.what).join(', ')}` : 'moved in';
        out.push({ size, who: who.split('@')[0], path, button: label, status });
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(300);
        if (page.url() !== base + path) { await page.goto(base + path, { waitUntil: 'domcontentloaded' }).catch(() => {}); await page.waitForTimeout(2500); }
      }
    }
    await ctx.close();
  }
}
await browser.close();
const still = out.filter((o) => o.status.startsWith('STILL'));
console.log(JSON.stringify({ pressed: out.length, movedIn: out.filter((o) => o.status === 'moved in' || o.status === 'slid in').length, still: still.length, nothing: out.filter((o) => o.status === 'nothing appeared').length }, null, 0));
for (const o of still) console.log(`${o.size} ${o.who} ${o.path} · ${o.button} → ${o.status}`);
if (process.argv.includes('--all')) for (const o of out) console.log(`${o.size} ${o.who} ${o.path} · ${o.button} → ${o.status}`);
