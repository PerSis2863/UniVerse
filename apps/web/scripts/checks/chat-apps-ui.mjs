// Q20 chat apps in the browser on the built Worker (pnpm local:serve --test-secret --owner-test).
// The made-up owner (owner@check.test, admin of their own school; sign-in keys from a stand-in on
// port 8790) adds a chat app in Admin → Integrations → Chat apps, copies its secret and sends a
// test. A stand-in app on port 8791 checks every request's signature and answers. A student of that
// school types /echo (answer posted in the chat, labelled) and /whisper (only they see it) in a chat;
// /slow times out; someone from no school can't use the app. Axe at 390/1280, light/dark, no sideways
// scrolling. Everything made here is removed at the end.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { launch } from '../browser-session.mjs';
import { verifyWebhookSignature } from './chat-apps-verify.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = 'http://localhost:8787', OWNER = 'owner@check.test', S = 'demo@student.com', B = 'bob@student.com';
const sql = (c) => execSync(`npx wrangler d1 execute universe-db --local --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: 'ignore' });
const rows = (c) => JSON.parse(execSync(`npx wrangler d1 execute universe-db --local --json --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0].results;
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const started = new Date().toISOString().replace('Z', '+00:00');

// ── The owner's sign-in (stand-in for Google's keys, this machine only) ──
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'check-key', alg: 'RS256', use: 'sig' };
const keys = createServer((_, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); }).listen(8790);
const now = Math.floor(Date.now() / 1000);
const ownerToken = await new SignJWT({ email: OWNER, email_verified: true, name: 'Check Owner', auth_time: now, firebase: { sign_in_provider: 'google.com', identities: {} } })
  .setProtectedHeader({ alg: 'RS256', kid: 'check-key' }).setIssuer('https://securetoken.google.com/universe-71e68').setAudience('universe-71e68')
  .setSubject('check-owner-uid').setIssuedAt(now).setExpirationTime(now + 3600).sign(privateKey);
const call = async (token, path, body, method, again = true) => {
  // One retry when the local server drops the connection (it can, just after the database is changed from outside).
  const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(async (e) => {
    if (!again) throw e;
    await new Promise((ok) => setTimeout(ok, 1500));
    return null;
  });
  if (!r) return call(token, path, body, method, false);
  return { s: r.status, b: await r.json().catch(() => ({})) };
};

// ── A stand-in chat app: refuses anything not signed with its secret ──
let secret = null;
const seen = { calls: 0, badSignature: 0, lastPayload: null };
const app = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    seen.calls++;
    if (!secret || !verifyWebhookSignature(body, String(req.headers['universe-signature'] ?? ''), secret)) { seen.badSignature++; res.writeHead(401); res.end(); return; }
    const p = JSON.parse(body);
    seen.lastPayload = p;
    const answer = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (p.type === 'ping') return answer({ text: 'pong' });
    if (p.command === 'echo') return answer({ text: `Echo: ${p.text}` });
    if (p.command === 'whisper') return answer({ text: `Psst: ${p.text}`, visibility: 'me' });
    if (p.command === 'slow') return void setTimeout(() => answer({ text: 'too late' }), 6500);
    answer({ text: '' });
  });
}).listen(8791);

// ── Put things back afterwards ──
const student = rows(`SELECT id, organizationId FROM users WHERE email='${S}'`)[0];
const chat = rows(`SELECT c.id FROM conversations c JOIN conversation_participants p ON p.conversationId = c.id
  WHERE p.userId='${student.id}' AND c.private = 0 AND c.communityId IS NULL
    AND (SELECT COUNT(*) FROM conversation_participants x WHERE x.conversationId = c.id) <= 10
    AND NOT EXISTS (SELECT 1 FROM conversation_participants s JOIN users u ON u.id = s.userId WHERE s.conversationId = c.id AND u.email = 'hello@universeimpact.system')
  ORDER BY c.updatedAt DESC LIMIT 1`)[0];
function restore() {
  sql(`DELETE FROM messages WHERE conversationId='${chat.id}' AND createdAt >= '${started}' AND metadata LIKE '%"app":%'`);
  sql(`UPDATE users SET organizationId=${q(student.organizationId)} WHERE id='${student.id}'`);
  const owner = rows(`SELECT id FROM users WHERE email='${OWNER}'`)[0];
  if (owner) {
    const org = rows(`SELECT id FROM organizations WHERE ownerId='${owner.id}'`)[0];
    if (org) { sql(`DELETE FROM chat_apps WHERE organizationId='${org.id}'`); sql(`DELETE FROM organizations WHERE id='${org.id}'`); }
    sql(`DELETE FROM audit_logs WHERE actorId='${owner.id}'`);
    sql(`DELETE FROM login_events WHERE userId='${owner.id}'`);
    sql(`DELETE FROM users WHERE id='${owner.id}'`);
  }
}

async function context(browser, { token, me, width, theme }) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(([t, u, th]) => {
    localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
    localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1');
  }, [token, me, theme]);
  // No real Firebase here: the owner's requests carry the stand-in sign-in.
  if (!token.startsWith('mock-token-')) await ctx.route(/\/api\//, (route) => { const h = route.request().headers(); return route.continue(h.authorization ? undefined : { headers: { ...h, authorization: `Bearer ${token}` } }); });
  return ctx;
}
async function axe(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const open = async (page, path, ready) => { await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60_000 }); await ready.waitFor({ timeout: 20_000 }); };

const api = {};
try {
  const ownerMe = (await call(ownerToken, '/api/core/auth/me')).b;
  // The student belongs to the owner's school for this check (set before they sign in: sign-ins are cached for a minute).
  await call(ownerToken, '/api/admin/chat-apps'); // makes the owner's school
  const org = rows(`SELECT id FROM organizations WHERE ownerId='${ownerMe.id}'`)[0];
  sql(`UPDATE users SET organizationId='${org.id}' WHERE id='${student.id}'`);
  const studentToken = `mock-token-${S}`;
  const studentMe = (await call(studentToken, '/api/core/auth/me')).b;
  const browser = await launch();
  try {
    for (const theme of ['light', 'dark']) for (const width of [1280, 390]) {
      const first = theme === 'light' && width === 1280;
      const r = { theme, width };
      const errors = [];
      // Admin → Integrations → Chat apps
      const actx = await context(browser, { token: ownerToken, me: ownerMe, width, theme });
      const page = await actx.newPage();
      page.on('pageerror', (e) => errors.push(`${new URL(page.url()).pathname}: ${e.message.slice(0, 120)}`));
      await open(page, '/admin/integrations/chat-apps', page.getByRole('heading', { name: 'Chat apps', level: 2 }));
      if (first) {
        await page.getByRole('button', { name: 'Add a chat app' }).click();
        await page.getByLabel('Name').fill('Check app');
        await page.getByLabel('The app’s address').fill('http://localhost:8791/app');
        await page.getByLabel('Command 1', { exact: true }).fill('echo');
        await page.getByLabel('What command 1 does').fill('Says it back');
        for (const [n, name] of [[2, 'whisper'], [3, 'slow']]) {
          await page.getByRole('button', { name: '+ Another command' }).click();
          await page.getByLabel(`Command ${n}`, { exact: true }).fill(name);
        }
        r.formAxe = await axe(page);
        await page.getByRole('button', { name: 'Add the app' }).click();
        await page.getByText('Copy Check app’s secret now.').waitFor({ timeout: 15_000 });
        secret = (await page.locator('[role="status"] code').first().innerText()).trim();
        r.secretShown = secret.startsWith('appsec_');
        await page.getByRole('button', { name: 'Send a test' }).click();
        r.testToast = (await page.locator('[data-sonner-toast]', { hasText: 'answered' }).first().innerText({ timeout: 15_000 }).catch(() => 'missing')).split('\n')[0];
      }
      await page.getByText('/echo').first().waitFor({ timeout: 15_000 });
      r.adminAxe = await axe(page);
      r.adminWide = await wide(page);
      await actx.close();

      if (first) {
        api.menu = (await call(studentToken, '/api/chat/apps')).b.commands?.map((c) => c.name);
        api.slow = await call(studentToken, `/api/chat/conversations/${chat.id}/app`, { command: 'slow', text: 'x' });
        api.slow = [api.slow.s, api.slow.b.error ?? api.slow.b.message];
        api.otherSchool = (await call(`mock-token-${B}`, `/api/chat/conversations/${chat.id}/app`, { command: 'echo', text: 'x' })).s; // 404: not a member / no app
        api.builtInRefused = (await call(ownerToken, '/api/admin/chat-apps', { name: 'Bad', url: 'https://x.example/a', commands: [{ name: 'ask', hint: '' }] })).s; // 400
        api.httpRefused = (await call(ownerToken, '/api/admin/chat-apps', { name: 'Bad', url: 'http://x.example/a', commands: [{ name: 'other', hint: '' }] })).s; // 400
        api.demoAdminCantAdd = (await call('mock-token-demo@admin.com', '/api/admin/chat-apps', { name: 'X', url: 'https://x.example/a', commands: [{ name: 'xx', hint: '' }] })).s; // read-only
      }

      // A chat: /echo posts for everyone, /whisper only for the student.
      const sctx = await context(browser, { token: studentToken, me: studentMe, width, theme });
      const chatPage = await sctx.newPage();
      chatPage.on('pageerror', (e) => errors.push(`${new URL(chatPage.url()).pathname}: ${e.message.slice(0, 120)}`));
      if (process.env.CHECK_DEBUG) chatPage.on('response', (res) => { if (/\/api\/chat\/(apps|conversations\/[^/]+\/app)/.test(res.url())) res.text().then((t) => console.log('DEBUG', res.status(), res.url().slice(-40), t.slice(0, 200))).catch(() => {}); });
      await open(chatPage, `/student/inbox?c=${chat.id}`, chatPage.getByPlaceholder(/Type a message, or \/ for commands/));
      const box = chatPage.getByPlaceholder(/Type a message, or \/ for commands/);
      await box.fill('/ec');
      r.menuShowsApp = await chatPage.getByRole('option', { name: /\/echo/ }).isVisible().catch(() => false);
      // The menu stays on screen (it ran off the right edge on phones).
      r.menuOnScreen = await chatPage.getByRole('listbox', { name: 'Commands' }).evaluate((el) => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; }).catch(() => 'missing');
      if (first) {
        await box.fill('/echo hello there');
        await box.press('Enter');
        await chatPage.locator('[id^="msg-"]', { hasText: 'Echo: hello there' }).first().waitFor({ timeout: 15_000 });
        r.label = await chatPage.getByText(/🧩 Check app/).first().isVisible();
        r.payloadHasNoEmail = !JSON.stringify(seen.lastPayload).includes('@');
        await box.fill('/whisper just me');
        await box.press('Enter');
        await chatPage.getByText('Psst: just me').last().waitFor({ timeout: 15_000 });
        r.onlyMe = await chatPage.getByText(/Check app · only you see this/i).isVisible();
        r.whisperNotSaved = rows(`SELECT COUNT(*) AS n FROM messages WHERE conversationId='${chat.id}' AND body LIKE 'Psst:%'`)[0].n === 0;
      } else await chatPage.locator('[id^="msg-"]', { hasText: 'Echo: hello there' }).first().waitFor({ timeout: 15_000 }).catch(async (e) => { if (process.env.CHECK_DEBUG) await chatPage.screenshot({ path: process.env.CHECK_DEBUG, fullPage: false }); throw e; });
      r.chatAxe = await axe(chatPage);
      r.chatWide = await wide(chatPage);
      // The service worker is blocked here (see context), so its registration is missing: not an app error.
      r.errors = errors.filter((e) => !e.includes("reading 'waiting'"));
      console.log(JSON.stringify(r));
      await sctx.close();
    }
  } finally {
    await browser.close();
  }
  api.appCalls = seen.calls;
  api.badSignatures = seen.badSignature;
  console.log('api', JSON.stringify(api));
} finally {
  restore();
  keys.close();
  app.close();
}
