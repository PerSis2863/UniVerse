// Q18 onboarding, profile and settings in the browser on the built Worker (pnpm local:serve).
// Profile: pronouns, about, availability and links saved; a photo chosen, cropped and uploaded; a cover
// photo. The profile page others see (no email), opened by id and by an old /student/profile/<name>
// link, with Message. Settings search finds a single setting, jumps to it and copies its link; a
// ?section=&setting= link opens it. The guided tour: it points at the real menu item (desktop) and
// the tab bar or More (phone), Next saves progress, Later brings it back at the same stop, Skip ends it.
// Sample mode. Axe at 390/1280, light/dark. Alice's and the teacher's profile and tour state are put
// back as they were at the end, and the files uploaded removed.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = 'http://localhost:8787', A = 'alice@student.com', B = 'bob@student.com', T = 'demo@teacher.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => {
  const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, b: await r.json().catch(() => ({})) };
};
const sql = (c) => execSync(`npx wrangler d1 execute universe-db --local --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: 'ignore' });
const rows = (c) => JSON.parse(execSync(`npx wrangler d1 execute universe-db --local --json --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0].results;
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const started = new Date().toISOString().replace('Z', '+00:00');

// ── Put things back afterwards ───────────────────────────────────────────
const saved = rows(`SELECT id, email, avatar, coverUrl, pronouns, bio, links, availability, tourStep, tourDoneAt FROM users WHERE email IN ('${A}', '${T}')`);
const alice = saved.find((u) => u.email === A);
function restore() {
  for (const u of saved) sql(`UPDATE users SET avatar=${q(u.avatar)}, coverUrl=${q(u.coverUrl)}, pronouns=${q(u.pronouns)}, bio=${q(u.bio)}, links=${q(u.links)}, availability=${q(u.availability)}, tourStep=${u.tourStep}, tourDoneAt=${q(u.tourDoneAt)} WHERE id='${u.id}'`);
  sql(`DELETE FROM stored_files WHERE ownerId='${alice.id}' AND createdAt >= '${started}'`);
  const chats = rows(`SELECT c.id FROM conversations c WHERE c.createdAt >= '${started}' AND c.isGroup=0 AND EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversationId=c.id AND p.userId='${alice.id}')`).map((r) => r.id);
  for (const id of chats) { sql(`DELETE FROM conversation_participants WHERE conversationId='${id}'`); sql(`DELETE FROM conversations WHERE id='${id}'`); }
}

// A small real photo (a 64×48 PNG, two colours) for the cropper and the cover, made here.
function makePng(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = x < w / 2 ? 79 : 236; raw[o + 1] = x < w / 2 ? 70 : 72; raw[o + 2] = x < w / 2 ? 229 : 153; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const png = makePng(64, 48);

const api = {};
api.badPronouns = (await call(A, '/api/core/users/me', { pronouns: '<b>x</b>' }, 'PATCH')).s;
api.badCover = (await call(A, '/api/core/users/me', { coverUrl: 'javascript:alert(1)' }, 'PATCH')).s;
api.linksCleaned = (await call(A, '/api/core/users/me', { links: [{ url: 'javascript:alert(1)' }, { url: 'http://kaggle.com/alice-test' }] }, 'PATCH')).b.links;
api.noEmailOnProfile = !JSON.stringify((await call(B, `/api/profile/${alice.id}`)).b).includes('@');
api.unknown = (await call(B, '/api/profile/nobody-here')).s;

// ── Browser helpers ───────────────────────────────────────────────────────
async function context(browser, email, { width = 390, theme = 'light', sample = false, tour = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  await ctx.addInitScript(([t, u, th, s, tr]) => {
    localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
    localStorage.setItem('theme', th);
    if (!tr) localStorage.setItem(`universe-tour-done:${u.id}`, '1');
    if (s) sessionStorage.setItem('universe:sample-mode', '1');
  }, [token, me, theme, sample, tour]);
  return ctx;
}
async function axe(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const toast = async (page, text) => (await page.locator('[data-sonner-toast]', { hasText: text }).last().innerText({ timeout: 15_000 }).catch(() => 'missing')).split('\n')[0];
const open = async (page, path, ready) => { await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60_000 }); await ready.waitFor({ timeout: 20_000 }); };
/** The tour's spotlight and the element it should be around. */
const spotlightOn = (page, selector) => page.evaluate((sel) => {
  const ring = [...document.querySelectorAll('[aria-modal="true"] > div[aria-hidden]')].find((d) => d.className.includes('ring-2'));
  const target = [...document.querySelectorAll(sel)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > 0 && r.left < innerWidth; });
  if (!ring || !target) return { ring: !!ring, target: !!target };
  const a = ring.getBoundingClientRect(), b = target.getBoundingClientRect();
  return { around: a.left <= b.left + 1 && a.top <= b.top + 1 && a.right >= b.right - 1 && a.bottom >= b.bottom - 1 };
}, selector);

const browser = await launch();
try {
  for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
    const act = theme === 'light' && width === 390;
    const r = { theme, width };
    const errors = [];
    const ctx = await context(browser, A, { width, theme });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${new URL(page.url()).pathname}: ${e.message.slice(0, 120)}`));

    // Settings → Profile
    await open(page, '/student/settings?section=profile', page.getByLabel('Pronouns (optional)').filter({ visible: true }).first());
    if (act) {
      await page.getByLabel('Pronouns (optional)').filter({ visible: true }).first().fill('she/her');
      await page.getByLabel('When people can reach you (optional)').filter({ visible: true }).first().fill('Usually free Tue afternoons');
      await page.getByLabel('About me (optional)').filter({ visible: true }).first().fill('Profile UI test: I like robots.');
      await page.getByRole('button', { name: 'Add a link' }).filter({ visible: true }).first().click();
      await page.getByLabel('Link 1 address').filter({ visible: true }).first().fill('github.com/alice-test');
      await page.getByRole('button', { name: 'Save changes' }).filter({ visible: true }).first().click();
      r.saved = await toast(page, 'Profile saved');
      const me = (await call(A, '/api/core/users/me')).b;
      r.fields = { pronouns: me.pronouns, bio: me.bio, availability: me.availability, links: me.links };
      // Photo: choose, crop, upload
      await page.locator('[data-setting="photo"]').filter({ visible: true }).first().locator('input[aria-label="Profile photo"]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
      const crop = page.getByRole('dialog', { name: 'Crop your photo' });
      await crop.getByRole('img', { name: /Photo preview/ }).waitFor({ timeout: 15_000 });
      await crop.getByLabel('Zoom').fill('1.6');
      await crop.getByRole('img', { name: /Photo preview/ }).press('ArrowLeft');
      r.cropAxe = await axe(page);
      await crop.getByRole('button', { name: 'Use photo' }).click();
      r.photo = await toast(page, 'Photo updated');
      await page.locator('[data-setting="cover"]').filter({ visible: true }).first().locator('input[aria-label="Cover photo"]').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png });
      r.cover = await toast(page, 'Cover photo updated');
      const after = (await call(A, '/api/core/users/me')).b;
      r.files = { avatar: /^\/api\/files\//.test(after.avatar ?? ''), cover: /^\/api\/files\//.test(after.coverUrl ?? ''), avatarCropped: /profile\.(jpg|webp)$/.test(after.avatar ?? '') };
    }
    r.profileAxe = await axe(page);
    r.profileWide = await wide(page);

    // Settings search: a single setting, its link (phones: back to the list first)
    if (width < 768) { await page.getByRole('button', { name: 'Settings', exact: true }).filter({ visible: true }).first().click(); await page.waitForTimeout(600); }
    await page.getByLabel('Search settings').filter({ visible: true }).first().fill('quiet');
    const hit = page.getByRole('group', { name: 'Matching settings' }).filter({ visible: true }).first();
    await hit.getByRole('button', { name: /Quiet hours/ }).first().waitFor({ timeout: 10_000 });
    r.searchAxe = await axe(page);
    if (act) {
      await hit.getByRole('button', { name: 'Copy a link to Quiet hours' }).click();
      r.copied = await toast(page, 'Link copied');
      r.clipboard = await page.evaluate(() => navigator.clipboard.readText()).catch(() => 'unreadable');
      await hit.getByRole('button', { name: /Quiet hours/ }).first().click();
      await page.waitForTimeout(800);
      r.jumped = { url: new URL(page.url()).search, shown: await page.locator('[data-setting="quiet-hours"]').filter({ visible: true }).count() > 0 };
      await open(page, '/student/settings?section=appearance&setting=theme', page.locator('[data-setting="theme"]').filter({ visible: true }).first());
      await page.waitForTimeout(600);
      r.linkOpens = await page.locator('[data-setting="theme"]').filter({ visible: true }).first().evaluate((e) => e.className.includes('ring-2'));
    }
    r.errors = errors;
    await ctx.close();

    // The profile page others see
    const bctx = await context(browser, B, { width, theme });
    const bpage = await bctx.newPage();
    bpage.on('pageerror', (e) => errors.push(`bob: ${e.message.slice(0, 120)}`));
    await open(bpage, `/people/${alice.id}`, bpage.locator('#profile-name'));
    if (act) {
      const text = await bpage.locator('main').innerText();
      r.page = { pronouns: text.includes('(she/her)'), bio: text.includes('I like robots'), free: text.includes('Usually free Tue afternoons'), github: await bpage.getByRole('link', { name: /GitHub/ }).getAttribute('href'), email: text.includes(A) };
      await open(bpage, `/student/profile/${encodeURIComponent('Alice Johnson')}`, bpage.locator('#profile-name'));
      r.oldLink = true;
      await bpage.getByRole('button', { name: 'Message' }).click();
      await bpage.waitForURL('**/inbox?c=**', { timeout: 20_000 }).catch(() => {});
      r.message = new URL(bpage.url()).pathname;
    }
    r.pageAxe = await axe(bpage);
    r.pageWide = await wide(bpage);
    await bctx.close();
    console.log(JSON.stringify(r));
  }

  // The guided tour (Alice): desktop points at the menu, phone at the tab bar and More.
  sql(`UPDATE users SET tourDoneAt=NULL, tourStep=0 WHERE id='${alice.id}'`);
  const tour = {};
  {
    const ctx = await context(browser, A, { width: 1280, tour: true });
    const page = await ctx.newPage();
    await page.goto(`${base}/student`, { waitUntil: 'networkidle' });
    const dialog = page.getByRole('dialog', { name: 'Your home' });
    await dialog.waitFor({ timeout: 20_000 });
    tour.desktopHome = await spotlightOn(page, '[data-tour-href="/student"]');
    tour.axe = await axe(page);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('dialog', { name: 'Courses' }).waitFor({ timeout: 10_000 });
    tour.desktopCourses = { ...(await spotlightOn(page, '[data-tour-hrefs~="/student/courses"], [data-tour-href="/student/courses"]')), text: await page.locator('#tour-text').innerText() };
    await page.waitForTimeout(800);
    tour.saved = rows(`SELECT tourStep FROM users WHERE id='${alice.id}'`)[0].tourStep;
    await page.getByRole('button', { name: 'Later' }).click();
    tour.closed = (await page.getByRole('dialog', { name: 'Courses' }).count()) === 0;
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'networkidle' });
    tour.resumed = await page.getByRole('dialog', { name: 'Courses' }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
    tour.step = await page.getByText(/Tour · \d+ of \d+/).innerText();
    for (let i = 0; i < 5; i++) { await page.getByRole('dialog').filter({ hasText: /Tour · / }).getByRole('button', { name: 'Next' }).click(); await page.waitForTimeout(300); }
    tour.atSearch = await page.getByRole('dialog').filter({ hasText: /Tour · / }).locator('#tour-title').innerText();
    await page.getByRole('dialog', { name: 'Search' }).waitFor({ timeout: 10_000 });
    tour.desktopSearch = await spotlightOn(page, '[data-tour="search"]');
    await ctx.close();
  }
  {
    sql(`UPDATE users SET tourStep=1 WHERE id='${alice.id}'`);
    const ctx = await context(browser, A, { width: 390, tour: true });
    const page = await ctx.newPage();
    await page.goto(`${base}/student`, { waitUntil: 'networkidle' });
    await page.getByRole('dialog', { name: 'Courses' }).waitFor({ timeout: 20_000 });
    tour.phoneCourses = await spotlightOn(page, 'nav[aria-label="Primary"] [data-tour-href="/student/courses"]');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('dialog', { name: 'Blackboard' }).waitFor({ timeout: 10_000 });
    tour.phoneBlackboard = { ...(await spotlightOn(page, '[data-tour="more"]')), text: await page.locator('#tour-text').innerText() };
    tour.phoneAxe = await axe(page);
    tour.phoneWide = await wide(page);
    await page.getByRole('button', { name: 'Skip tour' }).click();
    await page.waitForTimeout(800);
    tour.skipped = rows(`SELECT tourDoneAt FROM users WHERE id='${alice.id}'`)[0].tourDoneAt !== null;
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    tour.goneAfterSkip = (await page.getByRole('dialog').filter({ hasText: /Tour · / }).count()) === 0;
    await ctx.close();
  }
  {
    sql(`UPDATE users SET tourDoneAt=NULL, tourStep=0 WHERE email='${T}'`);
    const ctx = await context(browser, T, { width: 1280, theme: 'dark', tour: true });
    const page = await ctx.newPage();
    await page.goto(`${base}/teacher`, { waitUntil: 'networkidle' });
    tour.teacher = await page.getByRole('dialog', { name: 'Your home' }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
    tour.teacherAxe = await axe(page);
    await ctx.close();
  }
  console.log(JSON.stringify({ tour }));

  // Sample mode
  {
    const ctx = await context(browser, A, { sample: true });
    const page = await ctx.newPage();
    await open(page, '/people/sample-u-zoya', page.locator('#profile-name'));
    console.log(JSON.stringify({ sample: { profile: await page.getByText('Usually free on Friday afternoons').count() } }));
    await ctx.close();
  }
  console.log(JSON.stringify({ api }));
} finally {
  await browser.close();
  restore();
}
