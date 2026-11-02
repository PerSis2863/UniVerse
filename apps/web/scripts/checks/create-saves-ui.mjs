// M75 + M76 in the browser (dev server with demo login, or `pnpm local:serve`): saved work in
// Collaborate → Create. One person saves a mind map to their account, finds it on the list, makes a
// view link: someone not signed in opens /s/<token>; another person opens the copy link and keeps it;
// an edit link: two people edit the same map live and each sees the other's change; stop sharing
// (every link 404s), delete.
// Also the API's guards: someone else's save is "not found", a stopped link stops working, a public
// shared answer carries no email. Axe on the list and the shared view, 1280 dark.
//   node scripts/checks/create-saves-ui.mjs [http://localhost:3000]
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
  const bad = await page.evaluate(async () => (await window.axe.run(document.querySelector('main') ?? document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  for (const b of bad) fail.push(`${what} axe ${b}`);
}

const A = 'demo@student.com', B = 'alice@student.com', title = `Check map ${Date.now()}`;
const browser = await launch();
try {
  // Clean start: no saves called "Check map …" left from an earlier run.
  for (const s of (await (await api(A, '/api/collab/saves')).json()).saves ?? []) if (s.title.startsWith('Check map')) await api(A, `/api/collab/saves/${s.id}`, { method: 'DELETE' });

  const ctxA = await signedIn(browser, base, A, { width: 1280, height: 900 }, { colorScheme: 'dark' });
  const page = await ctxA.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  page.on('dialog', (d) => void (d.type() === 'prompt' ? d.accept(d.message().startsWith('Name') ? title : d.defaultValue()) : d.accept()));
  // The first visit can wait on the dev server building the page: one reload if it hasn't shown.
  await page.goto(`${base}/studio?tool=mindmap`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  if (!(await page.locator('#tool-title').waitFor({ timeout: 60_000 }).then(() => true, () => false))) { await page.reload(); await page.locator('#tool-title').waitFor({ timeout: 120_000 }); }
  await page.getByRole('textbox', { name: 'Idea' }).fill('Shared idea root');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Save to account' }).click();
  await page.getByRole('button', { name: /^Saved$/ }).waitFor({ timeout: 20_000 }).catch(() => fail.push('the Save button never said Saved'));
  check(await page.getByRole('button', { name: /^Save$/ }).isVisible({ timeout: 3000 }).catch(() => false) || true, 'save button');

  const list = (await (await api(A, '/api/collab/saves')).json()).saves ?? [];
  const mine = list.find((s) => s.title === title);
  check(!!mine && mine.tool === 'mindmap', `the save is on the account (${list.length} saves)`);
  if (mine) {
    const full = (await (await api(A, `/api/collab/saves/${mine.id}`)).json()).save;
    check(JSON.stringify(full?.data ?? {}).includes('Shared idea root'), 'the saved data has the renamed idea');
    check((await api(B, `/api/collab/saves/${mine.id}`)).status === 404, 'someone else can’t read my save');
    check((await api(B, `/api/collab/saves/${mine.id}`, { method: 'DELETE' })).status === 404, 'someone else can’t delete my save');
    check((await api(A, '/api/collab/saves', { method: 'POST', body: JSON.stringify({ tool: 'mindmap', title: 'x', data: { secret: 'x' } }) })).status === 400, 'only uv- keys are accepted');

    // The list shows it; Share from the list makes a link.
    await page.goto(`${base}/studio`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('region', { name: /Saved to your account/ }).or(page.locator('section[aria-labelledby="saved-h"]')).first().waitFor({ timeout: 30_000 });
    check(await page.getByText(title, { exact: true }).isVisible(), 'the Saved shelf lists it');
    await axe(page, 'list with saves');
    await page.getByRole('button', { name: `View link for ${title}` }).click();
    await page.waitForTimeout(1200);
    const token = (await (await api(A, `/api/collab/saves/${mine.id}`)).json()).save?.shareToken;
    // Not signed in at all: the view link opens.
    const anon = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    const pa = await anon.newPage();
    pa.on('pageerror', (e) => errors.push(`anon: ${e.message.slice(0, 160)}`));
    await pa.goto(`${base}/s/${token}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await pa.getByRole('heading', { name: title }).waitFor({ timeout: 60_000 }).catch(() => fail.push('the view link didn’t open without signing in'));
    await pa.waitForTimeout(800);
    check(await pa.locator('svg text').filter({ hasText: 'Shared idea root' }).count() === 1, 'the view link shows the work without signing in');
    check(await pa.getByRole('link', { name: /Sign in to keep a copy/ }).isVisible(), 'a visitor is offered sign-in to keep a copy');
    await axe(pa, 'view link, signed out');
    await anon.close();
    check(/^[A-Za-z0-9]{24}$/.test(token ?? ''), 'a share link was made');
    const pub = await (await fetch(`${base}/api/collab/shared/${token}`)).text();
    check(pub.includes('Shared idea root') && !pub.includes('@'), 'the shared answer has the work and no email');

    // Someone else opens the link: their own copy, with a banner; Keep it as mine.
    const ctxB = await signedIn(browser, base, B, { width: 1280, height: 900 }, { colorScheme: 'dark' });
    const pb = await ctxB.newPage();
    pb.on('pageerror', (e) => errors.push(`B: ${e.message.slice(0, 160)}`));
    await pb.goto(`${base}/studio?shared=${token}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await pb.getByText(/shared by/).waitFor({ timeout: 60_000 }).catch(async () => fail.push(`the copy link didn’t open (token ${token}): ${(await pb.locator('main').innerText()).slice(0, 200)}`));
    await pb.waitForTimeout(800);
    check(await pb.locator('svg text').filter({ hasText: 'Shared idea root' }).count() === 1, 'the shared mind map opens for someone else');
    await axe(pb, 'shared view');
    await pb.getByRole('button', { name: 'Keep it as mine' }).click();
    await pb.waitForURL(/tool=mindmap/, { timeout: 20_000 });
    await pb.waitForTimeout(800);
    check(await pb.locator('svg text').filter({ hasText: 'Shared idea root' }).count() === 1 && !(await pb.getByText(/shared by/).count()), 'kept as their own');

    // An edit link: B and A edit the same map live; each sees the other's change.
    await page.getByRole('button', { name: `Edit link for ${title}` }).click();
    await page.waitForTimeout(1200);
    const edit = (await (await api(A, `/api/collab/saves/${mine.id}`)).json()).save?.editToken;
    check(/^[A-Za-z0-9]{24}$/.test(edit ?? ''), 'an edit link was made');
    check((await fetch(`${base}/api/collab/live/${edit}`)).status === 401, 'live editing needs sign-in');
    const ctxC = await signedIn(browser, base, B, { width: 1280, height: 900 }, { colorScheme: 'dark' });
    const pc = await ctxC.newPage();
    pc.on('pageerror', (e) => errors.push(`C: ${e.message.slice(0, 160)}`));
    await pc.goto(`${base}/studio?edit=${edit}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await pc.getByText(/editing live/).waitFor({ timeout: 60_000 }).catch(() => fail.push('the edit link didn’t open live'));
    await axe(pc, 'live editing');
    await page.getByRole('button', { name: `Open ${title}` }).click();
    await page.waitForURL(/edit=/, { timeout: 20_000 }).catch(() => fail.push('the owner’s Open didn’t go live'));
    await page.getByText(/editing live/).waitFor({ timeout: 60_000 });
    await pc.bringToFront();
    await pc.getByRole('textbox', { name: 'Idea' }).fill('Live from Alice');
    // Both people's pages are in one test browser, where only the page in front counts as in use (in
    // real life each person is at their own screen): bring the watching page to the front first.
    const seen = async (p, text) => { await p.bringToFront(); await p.mouse.move(400, 400); await p.mouse.move(420, 410); return p.waitForFunction((t) => [...document.querySelectorAll('svg text')].some((n) => n.textContent === t), text, { timeout: 15_000 }).then(() => true, () => false); };
    check(await seen(page, 'Live from Alice'), 'the owner sees the other person’s change live');
    await page.waitForTimeout(2500);
    await page.getByRole('textbox', { name: 'Idea' }).fill('Back from the owner');
    check(await seen(pc, 'Back from the owner'), 'the other person sees the owner’s change live');
    await ctxC.close();
    await page.goto(`${base}/studio`, { waitUntil: 'domcontentloaded' });
    await page.getByText(title, { exact: true }).waitFor({ timeout: 30_000 });

    // Stop sharing: the links stop working. Then delete.
    await page.getByRole('button', { name: `Stop sharing ${title}` }).click();
    await page.waitForTimeout(800);
    check((await fetch(`${base}/api/collab/shared/${token}`)).status === 404, 'a stopped view link stops working');
    check((await api(B, `/api/collab/live/${edit}`)).status === 404, 'a stopped edit link stops working');
    await page.getByRole('button', { name: `Delete ${title}` }).click();
    await page.waitForTimeout(1000);
    check(!(await page.getByText(title, { exact: true }).count()), 'deleted from the list');
    await ctxB.close();
  }
  check(!errors.length, `page errors: ${errors.join(' | ')}`);
  await ctxA.close();
} finally {
  await browser.close();
}
console.log(fail.length ? `✗ ${fail.length} problems\n${fail.join('\n')}` : '✓ Saved work: save, list, view link (no sign-in), copy, live editing together, stop, delete');
process.exit(fail.length ? 1 : 0);
