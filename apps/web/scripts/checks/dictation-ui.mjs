// M229 voice typing: with a stand-in for the browser's speech recognition that "hears" a sentence, the microphone button
// types it into a chat message (spoken "comma" and "full stop" as marks), a new document and a quick note; axe on the
// button. Runs against `local:serve` (or BASE=… for local:dev).
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787';
const browser = await launch();
const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
await ctx.addInitScript(() => {
  // The stand-in: on start it hears one phrase, then ends (the hook starts it again while on).
  class Fake { constructor() { this.onresult = null; this.onend = null; this.onerror = null; } start() { setTimeout(() => { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'see you at nine comma bring the notes full stop' }], { isFinal: true })] }); }, 300); } abort() {} }
  window.webkitSpeechRecognition = Fake; window.SpeechRecognition = Fake;
  localStorage.setItem('uv-cookies', 'essential');
});
const page = await ctx.newPage();
const out = { errors: [] };
page.on('pageerror', (e) => out.errors.push(e.message.slice(0, 160)));
const listen = async () => { const b = page.getByRole('button', { name: 'Voice typing' }).first(); await b.click(); await page.waitForTimeout(900); await page.getByRole('button', { name: 'Stop voice typing' }).first().click(); };
// A chat.
const convo = await (await page.request.get(`${base}/api/chat/conversations`, { headers: { Authorization: 'Bearer mock-token-alice@student.com' } })).json();
await page.goto(`${base}/student/inbox?c=${convo.conversations[0].id}`, { waitUntil: 'load', timeout: 180_000 });
await page.getByRole('button', { name: 'Voice typing' }).first().waitFor({ timeout: 120_000 }).catch(() => {});
if (await page.getByRole('button', { name: 'Voice typing' }).count()) { await listen(); out.chat = await page.locator('textarea.msg-search').inputValue(); }
await page.addScriptTag({ path: AXE });
out.axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id));
// A quick note.
await page.goto(`${base}/studio?tool=notes`, { waitUntil: 'load', timeout: 180_000 });
await page.getByRole('button', { name: /New note/ }).first().click({ timeout: 60_000 }).catch(() => {});
await page.getByRole('button', { name: 'Voice typing' }).first().waitFor({ timeout: 60_000 }).then(listen).then(async () => { out.note = await page.getByRole('group', { name: 'Note' }).locator('textarea').last().inputValue(); }).catch((e) => { out.note = `not found: ${e.message.slice(0, 60)}`; });
console.log(JSON.stringify(out, null, 2));
await browser.close();
