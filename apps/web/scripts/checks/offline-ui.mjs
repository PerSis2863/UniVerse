// M46 on the built site (`pnpm local:serve`: the service worker only exists in a build), as a
// student's phone: online, the app keeps copies of the timetable, courses and chats on the device;
// offline, the home still shows today's classes and a page never opened shows the offline page with
// today's classes, the latest chats and the courses (axe at 390 and 1280, light and dark). Also: the
// bar colour and the iPhone launch screens follow the app's theme (one theme-color, changed by the
// theme button; 22 sizes upright plus 9 iPads sideways), and the launch screens are served.
//   node scripts/checks/offline-ui.mjs [http://localhost:8787]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

// Without this, a test browser's "offline" doesn't reach the service worker's own requests.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };

async function axe(page, what) {
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  for (const b of bad) fail.push(`${what} axe ${b}`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${what}: sideways scrolling`);
}

const keptKeys = (page) => page.evaluate(() => new Promise((resolve) => {
  const r = indexedDB.open('universe-offline');
  r.onsuccess = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains('reads')) return resolve([]);
    const q = db.transaction('reads').objectStore('reads').getAllKeys();
    q.onsuccess = () => { resolve(q.result); db.close(); };
  };
}));

const bars = (page) => page.evaluate(() => ({
  colours: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content),
  ios: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content,
}));

const browser = await launch();
const out = {};
try {
  for (const scheme of ['light', 'dark']) {
    for (const width of [390, 1280]) {
      const what = `${scheme} ${width}`;
      const ctx = await signedIn(browser, base, 'demo@student.com', { width, height: 844 }, width < 600 ? { colorScheme: scheme, hasTouch: true, isMobile: true } : { colorScheme: scheme });
      await ctx.addInitScript((s) => { try { if (!localStorage.getItem('theme')) localStorage.setItem('theme', s); } catch { /* a locked frame */ } }, scheme);
      const page = await ctx.newPage();
      await page.goto(`${base}/student`, { waitUntil: 'load' });
      await page.evaluate(() => navigator.serviceWorker.ready);
      // Now under the service worker: this load is saved for offline use, like any visit.
      await page.reload({ waitUntil: 'load' });
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(6000); // the idle refresh of the offline copies
      const keys = await keptKeys(page);
      for (const k of ['/api/core/timetable/my', '/api/core/courses/my', '/api/chat/conversations']) check(keys.includes(k), `${what}: ${k} kept`);
      check(keys.some((k) => k.startsWith('/api/student/overview')), `${what}: home kept`);

      const b = await bars(page);
      const dark = scheme === 'dark';
      check(b.colours.length === 1 && b.colours[0] === (dark ? '#0b0b0c' : '#ebeae6'), `${what}: bar colour ${b.colours}`);
      check(b.ios === (dark ? 'black-translucent' : 'default'), `${what}: iPhone status bar ${b.ios}`);

      // Offline: the browser says so, and every request fails (the service worker's too).
      await ctx.setOffline(true);
      await ctx.route('**/*', (r) => r.abort('internetdisconnected'));
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(2500);
      const homeText = await page.locator('main').innerText().catch(() => '');
      check(/Attendance/.test(homeText) && /Average grade/.test(homeText), `${what}: home offline shows its saved data`);
      check(await page.getByText(/offline/i).first().isVisible().catch(() => false), `${what}: offline bar`);

      // A page never opened on this device: the offline page with the saved copies.
      await page.goto(`${base}/student/wellbeing`, { waitUntil: 'load' }).catch(() => {});
      await page.waitForTimeout(1500);
      const offline = await page.evaluate(() => ({
        title: document.querySelector('h1')?.textContent,
        sub: document.getElementById('sub')?.textContent,
        today: document.querySelector('#today h2')?.textContent,
        rows: ['today', 'chats', 'courses'].map((id) => document.querySelectorAll(`#${id}:not([hidden]) li`).length),
        dark: document.documentElement.classList.contains('dark'),
      }));
      out[what] = offline;
      check(offline.title === "You're offline", `${what}: offline page`);
      check(/saved on this device/.test(offline.sub ?? ''), `${what}: offline page shows saved copies`);
      check(offline.rows.every((n) => n > 0), `${what}: today, chats and courses listed ${offline.rows}`);
      check(offline.dark === dark, `${what}: offline page follows the theme`);
      await axe(page, `${what} offline page`);
      await ctx.unrouteAll();
      await ctx.setOffline(false);

      if (width === 1280 && scheme === 'light') {
        // The theme button changes the bar colour and the launch screens straight away.
        await page.goto(`${base}/student`, { waitUntil: 'load' });
        const launch = () => page.evaluate(() => [...document.querySelectorAll('link[rel="apple-touch-startup-image"]')].map((l) => l.getAttribute('href')));
        const before = await launch();
        check(before.length === 31 && before.every((h) => h.startsWith('/splash/light-')), `launch screens follow the light theme: ${before.length} ${before[0]}`);
        await page.getByRole('button', { name: 'Toggle theme' }).first().click();
        await page.getByRole('button', { name: /^dark$/i }).click();
        await page.waitForTimeout(800);
        const after = await bars(page);
        check(after.colours[0] === '#0b0b0c' && after.ios === 'black-translucent', `theme button: bars ${JSON.stringify(after)}`);
        const links = await launch();
        check(links.length === 31 && links.every((h) => h.startsWith('/splash/dark-')), `launch screens follow the theme button: ${links[0]}`);
        for (const h of [links[0], links.at(-1), before.at(-1)].filter(Boolean)) {
          const res = await page.request.get(base + h);
          check(res.ok() && res.headers()['content-type'] === 'image/png', `launch screen ${h} served: ${res.status()}`);
        }
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
