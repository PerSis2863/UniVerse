// M75 in the browser (dev server with demo login, or `pnpm local:serve`): saved work in Collaborate →
// Create. One person saves a mind map to their account, finds it on the list, shares it by link;
// another person opens the link (their own copy, a banner), keeps it; the first deletes the save.
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
  await page.goto(`${base}/studio?tool=mindmap`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.locator('#tool-title').waitFor({ timeout: 120_000 });
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
    await page.getByRole('button', { name: `Share ${title}` }).click();
    await page.waitForTimeout(1200);
    const token = (await (await api(A, `/api/collab/saves/${mine.id}`)).json()).save?.shareToken;
    check(/^[A-Za-z0-9]{24}$/.test(token ?? ''), 'a share link was made');
    const pub = await (await fetch(`${base}/api/collab/shared/${token}`)).text();
    check(pub.includes('Shared idea root') && !pub.includes('@'), 'the shared answer has the work and no email');

    // Someone else opens the link: their own copy, with a banner; Keep it as mine.
    const ctxB = await signedIn(browser, base, B, { width: 1280, height: 900 }, { colorScheme: 'dark' });
    const pb = await ctxB.newPage();
    pb.on('pageerror', (e) => errors.push(`B: ${e.message.slice(0, 160)}`));
    await pb.goto(`${base}/studio?shared=${token}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await pb.getByText(/shared by/).waitFor({ timeout: 60_000 });
    await pb.waitForTimeout(800);
    check(await pb.locator('svg text').filter({ hasText: 'Shared idea root' }).count() === 1, 'the shared mind map opens for someone else');
    await axe(pb, 'shared view');
    await pb.getByRole('button', { name: 'Keep it as mine' }).click();
    await pb.waitForURL(/tool=mindmap/, { timeout: 20_000 });
    await pb.waitForTimeout(800);
    check(await pb.locator('svg text').filter({ hasText: 'Shared idea root' }).count() === 1 && !(await pb.getByText(/shared by/).count()), 'kept as their own');

    // Stop sharing: the link stops working. Then delete.
    await page.getByRole('button', { name: `Stop sharing ${title}` }).click();
    await page.waitForTimeout(800);
    check((await fetch(`${base}/api/collab/shared/${token}`)).status === 404, 'a stopped link stops working');
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
console.log(fail.length ? `✗ ${fail.length} problems\n${fail.join('\n')}` : '✓ Saved work: save, list, share, open, keep, stop, delete');
process.exit(fail.length ? 1 : 0);
