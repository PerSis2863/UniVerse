// M80 in the browser (dev server with demo login, or `pnpm local:serve`): a teacher (tara, CS101)
// saves a mind map in Collaborate → Create and uses Share → Add to a course: the sheet lists their
// courses, the work lands as a link in a module, a student of the course sees it there and the link
// opens read-only without sign-in. A student isn't offered "Add to a course". Axe on the sheet at
// 390 light and 1280 dark. Removes what it made.
//   node scripts/checks/create-course-ui.mjs [http://localhost:3000]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };
const api = (email, path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer mock-token-${email}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
async function axe(page, what) {
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  for (const b of bad) fail.push(`${what} axe ${b}`);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!wide, `${what}: sideways scrolling`);
}

const T = 'tara@teacher.com', S = 'alice@student.com';
const courses = await (await api(T, '/api/core/courses/my')).json();
const cs = courses.find((c) => c.code === 'CS101') ?? courses[0];
if (!cs) { console.log('✗ tara teaches no course'); process.exit(1); }
const browser = await launch();
const made = [];
try {
  for (const [width, theme] of [[1280, 'dark'], [390, 'light']]) {
    const title = `Course map ${width} ${Date.now()}`;
    const ctx = await signedIn(browser, base, T, { width, height: 900 }, { colorScheme: theme });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    page.on('dialog', (d) => void d.accept(title));
    await page.goto(`${base}/studio?tool=mindmap`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    if (!(await page.locator('#tool-title').waitFor({ timeout: 60_000 }).then(() => true, () => false))) { await page.reload(); await page.locator('#tool-title').waitFor({ timeout: 120_000 }); }
    await page.getByRole('textbox', { name: 'Idea' }).fill(`Idea for ${width}`);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Share' }).click();
    await page.getByRole('menuitem', { name: /Add to a course/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Add to a course' });
    await sheet.waitFor({ timeout: 20_000 }).catch(() => fail.push(`${width}: the sheet didn't open`));
    await sheet.getByRole('combobox', { name: 'Course' }).selectOption(cs.id);
    await sheet.getByRole('combobox', { name: 'Module' }).waitFor({ timeout: 20_000 }).catch(() => fail.push(`${width}: no module picker`));
    await page.waitForTimeout(400);
    await axe(page, `${width} ${theme} sheet`);
    await sheet.getByRole('button', { name: new RegExp(`^Add “${title}”`) }).click();
    await sheet.waitFor({ state: 'detached', timeout: 20_000 }).catch(() => fail.push(`${width}: the sheet didn't close after Add`));
    const mods = await (await api(S, `/api/courses/${cs.id}/modules`)).json();
    const item = mods.modules?.flatMap((m) => m.items.map((i) => ({ ...i, moduleId: m.id }))).find((i) => i.title === title);
    check(!!item, `${width}: the student sees the work in the course's modules`);
    const saves = (await (await api(T, '/api/collab/saves')).json()).saves ?? [];
    const save = saves.find((x) => x.title === title);
    if (save) made.push(save.id);
    if (item) {
      made.push(`item:${item.id}`);
      const href = item.url ?? item.href ?? '';
      check(/\/s\/[A-Za-z0-9]{24}$/.test(href), `${width}: the item is a view link (${href})`);
      const token = href.split('/s/')[1];
      const pub = await (await fetch(`${base}/api/collab/shared/${token}`)).text();
      check(pub.includes(`Idea for ${width}`), `${width}: the link shows the work without sign-in`);
    }
    check(!errors.length, `${width}: page errors ${errors.join(' | ')}`);
    await ctx.close();
  }
  // A student isn't offered it.
  const sctx = await signedIn(browser, base, S, { width: 1280, height: 900 }, { colorScheme: 'dark' });
  const sp = await sctx.newPage();
  await sp.goto(`${base}/studio?tool=mindmap`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sp.locator('#tool-title').waitFor({ timeout: 60_000 });
  await sp.getByRole('button', { name: 'Share' }).click();
  check(!(await sp.getByRole('menuitem', { name: /Add to a course/ }).count()), 'a student is not offered Add to a course');
  await sctx.close();
} finally {
  for (const m of made) {
    if (m.startsWith('item:')) await api(T, `/api/courses/${cs.id}/modules`, { method: 'POST', body: JSON.stringify({ action: 'delete-item', itemId: m.slice(5) }) });
    else await api(T, `/api/collab/saves/${m}`, { method: 'DELETE' });
  }
  await browser.close();
}
console.log(fail.length ? `✗ ${fail.length} problems\n${fail.join('\n')}` : '✓ Add to a course: sheet, module link, the student sees it, opens without sign-in; not offered to students');
process.exit(fail.length ? 1 : 0);
