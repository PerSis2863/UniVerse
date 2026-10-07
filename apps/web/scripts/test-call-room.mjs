// Call room tests: the real CallRoom Durable Object (cloudflare/worker.ts) in the Workers runtime,
// with several fake participants over WebSockets: breakout rooms (Stage 4 · 2.6) and live polls
// (2.7). Bundles the worker (with a stand-in for the built Next.js app), runs it with `wrangler dev`
// and a small entry that reaches call rooms directly (as the app server and other rooms do).
//
//   node scripts/test-call-room.mjs           (about 20 s)
//   TIMER=1 node scripts/test-call-room.mjs   (adds the breakout timer: about 2 min)
//
// Needs nothing deployed and no secrets; uses its own temporary folder.
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(web, 'package.json'));
const wranglerPkg = require.resolve('wrangler/package.json');
const esbuild = require(require.resolve('esbuild', { paths: [wranglerPkg] }));
const dir = mkdtempSync(join(tmpdir(), 'universe-call-room-'));

await esbuild.build({
  entryPoints: [join(web, 'cloudflare/worker.ts')], bundle: true, format: 'esm', target: 'es2022', platform: 'neutral',
  outfile: join(dir, 'worker.mjs'), external: ['cloudflare:workers', 'node:*'], tsconfig: join(web, 'cloudflare/tsconfig.json'),
  conditions: ['workerd', 'worker', 'browser'], mainFields: ['module', 'main'], logLevel: 'error',
  plugins: [{ name: 'stub-next', setup(b) {
    b.onResolve({ filter: /\.open-next\/worker\.js$/ }, () => ({ path: 'next-stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default { fetch: () => new Response("next") };', loader: 'js' }));
  } }],
});
writeFileSync(join(dir, 'test-entry.mjs'), `export { CallRoom, RealtimeHub, BoardRoom, CodeRoom } from './worker.mjs';
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = /^\\/__do\\/([^/]+)(\\/.*)$/.exec(url.pathname);
    if (!m) return new Response('test', { status: 404 });
    const stub = env.CALLS.get(env.CALLS.idFromName(decodeURIComponent(m[1])));
    return stub.fetch(new Request('https://call' + m[2] + url.search, req));
  },
};
`);
writeFileSync(join(dir, 'wrangler.jsonc'), JSON.stringify({
  name: 'call-room-test', main: 'test-entry.mjs', compatibility_date: '2025-09-01', compatibility_flags: ['nodejs_compat'],
  durable_objects: { bindings: [{ name: 'CALLS', class_name: 'CallRoom' }, { name: 'REALTIME', class_name: 'RealtimeHub' }, { name: 'BOARDS', class_name: 'BoardRoom' }, { name: 'CODE', class_name: 'CodeRoom' }] },
  migrations: [{ tag: 'v1', new_sqlite_classes: ['CallRoom', 'RealtimeHub', 'BoardRoom', 'CodeRoom'] }],
  // Placeholders so webinar mode can be switched on (these tests never reach the SFU itself).
  vars: { CALLS_APP_ID: 'test-app', CALLS_APP_SECRET: 'test-secret' },
}, null, 2));

const PORT = process.env.PORT ?? '8799';
const dev = spawn(process.execPath, [join(dirname(wranglerPkg), 'bin', 'wrangler.js'), 'dev', '--config', join(dir, 'wrangler.jsonc'), '--port', PORT, '--ip', '127.0.0.1', '--local', '--persist-to', join(dir, '.state')], { cwd: dir, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
let devLog = '';
dev.stdout.on('data', (d) => { devLog += d; });
dev.stderr.on('data', (d) => { devLog += d; });
for (let i = 0; i < 150 && !/Ready on/.test(devLog); i++) await new Promise((r) => setTimeout(r, 200));
if (!/Ready on/.test(devLog)) { console.log(devLog.slice(-2000)); dev.kill(); process.exit(1); }
const BASE = `http://127.0.0.1:${PORT}`;
const room = (id) => ({ fetch: (path, init) => fetch(`${BASE}/__do/${encodeURIComponent(id)}${path.replace(/^https:\/\/call/, '')}`, init) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failures++; };

/** A participant: joins a room (ticket like the app gets one), and keeps what the room says. */
async function joinRoom(callId, user, host = false, extra = {}) {
  const t = await room(callId).fetch('https://call/ticket', { method: 'POST', body: JSON.stringify({ userId: user.id, name: user.name, host, max: 50, ...extra }) });
  const { ticket } = await t.json();
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/__do/${encodeURIComponent(callId)}/call-live?call=${encodeURIComponent(callId)}&ticket=${ticket}`);
  const p = { user, callId, ws, msgs: [], welcome: null, bo: undefined };
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    p.msgs.push(m);
    if (m.type === 'welcome') { p.welcome = m; p.bo = m.bo; p.peerId = m.you; }
    if (m.type === 'breakout') p.bo = m.bo;
    if (m.type === 'welcome') p.poll = m.poll;
    if (m.type === 'poll') p.poll = m.poll;
  });
  for (let i = 0; i < 50 && !p.welcome; i++) await sleep(20);
  return p;
}
const send = (p, m) => p.ws.send(JSON.stringify(m));
/** Like callTicket for a breakout room: the main call says whether this person may join room n. */
async function pass(callId, n, user, host = false) {
  const r = await room(callId).fetch('https://call/breakout-pass', { method: 'POST', body: JSON.stringify({ userId: user.id, host, n }) });
  return { status: r.status, body: await r.json() };
}
const leave = async (p) => { p.ws.close(1000); await sleep(100); };

const call = 'c_course1';
const teacher = { id: 't1', name: 'Ms Teacher' };
const [ana, ben, cai] = [{ id: 's1', name: 'Ana' }, { id: 's2', name: 'Ben' }, { id: 's3', name: 'Cai' }];

// Everyone in the main call.
const T = await joinRoom(call, teacher, true);
const A = await joinRoom(call, ana), B = await joinRoom(call, ben), C = await joinRoom(call, cai);
check(T.welcome?.host === true && A.welcome?.host === false, 'teacher hosts, students don’t');
check(A.welcome?.bo === null, 'no breakout rooms yet');

// A student can't open rooms.
send(A, { type: 'control', action: 'bo-open', rooms: 2, assign: {}, minutes: 0, choose: false });
await sleep(150);
check(A.bo === null && T.bo === null, 'a student can’t open rooms');

// The teacher opens 2 rooms: Ana and Ben in room 1, Cai in room 2.
send(T, { type: 'control', action: 'bo-open', rooms: 2, assign: { [A.peerId]: 1, [B.peerId]: 1, [C.peerId]: 2 }, minutes: 0, choose: false });
await sleep(200);
check(A.bo?.mine === 1 && B.bo?.mine === 1 && C.bo?.mine === 2, 'each student is told their room');
check(T.bo?.people?.length === 3 && !('userId' in (T.bo?.people?.[0] ?? {})), 'the host sees who goes where (keys, no account ids)');
check(A.bo?.people === undefined && A.bo?.rooms?.[0]?.here === undefined, 'students don’t get the full plan');

// Passes: own room yes, other room no, host any room.
check((await pass(call, 1, ana)).status === 200, 'Ana may join room 1');
check((await pass(call, 2, ana)).status === 403, 'Ana may not join room 2');
check((await pass(call, 2, teacher, true)).status === 200 && (await pass(call, 2, teacher, true)).body.host === true, 'the teacher may visit any room, as host');

// The students move (like the app does): leave the main call, join their room.
await leave(A); await leave(B); await leave(C);
const A1 = await joinRoom(`${call}~b1`, ana), B1 = await joinRoom(`${call}~b1`, ben), C2 = await joinRoom(`${call}~b2`, cai);
check(A1.welcome?.room === 1 && C2.welcome?.room === 2, 'joined their rooms');
check(A1.welcome?.bo?.mine === 1 && A1.welcome?.bo?.rooms?.length === 2, 'a room’s welcome carries the plan (from the main call)');
check(B1.welcome?.peers?.some((p) => p.name === 'Ana'), 'Ben sees Ana in room 1');
await sleep(200);
const here1 = T.bo?.rooms?.find((r) => r.n === 1)?.here ?? [];
check(here1.includes('Ana') && here1.includes('Ben') && T.bo?.rooms?.find((r) => r.n === 2)?.count === 1, 'the host sees who’s in each room, live');

// The teacher visits room 1 and messages every room from there.
await leave(T);
const T1 = await joinRoom(`${call}~b1`, teacher, true);
check(T1.welcome?.host === true && Array.isArray(T1.welcome?.bo?.people), 'visiting: host, with the full plan');
send(T1, { type: 'control', action: 'bo-note', text: '5 minutes left' });
await sleep(250);
check(C2.bo?.note?.text === '5 minutes left' && A1.bo?.note?.text === '5 minutes left', 'a message from a visiting host reaches every room');

// Cai asks for help: the teacher (in room 1) hears it.
send(C2, { type: 'bo-help' });
await sleep(250);
check(T1.msgs.some((m) => m.type === 'bo-help' && m.n === 2 && m.by === 'Cai'), 'help from room 2 reaches the host in room 1');
check(!A1.msgs.some((m) => m.type === 'bo-help'), 'students don’t see help requests');

// The teacher moves Ben to room 2.
const benKey = T1.bo.people.find((p) => p.name === 'Ben').k;
send(T1, { type: 'control', action: 'bo-assign', k: benKey, n: 2 });
await sleep(250);
check(B1.bo?.mine === 2, 'Ben is told to move to room 2');

// A timer: 5 more minutes.
send(T1, { type: 'control', action: 'bo-time', minutes: 5 });
await sleep(200);
check(typeof A1.bo?.endsAt === 'number' && A1.bo.endsAt > Date.now() + 4 * 60_000, 'the timer reaches the rooms');

// Close: everyone gets 30 s; then back now.
send(T1, { type: 'control', action: 'bo-close' });
await sleep(250);
check(typeof C2.bo?.closing === 'number' && C2.bo.closing > Date.now(), 'closing: the countdown reaches every room');
send(T1, { type: 'control', action: 'bo-end' });
await sleep(300);
check(A1.bo === null && C2.bo === null && T1.bo === null, 'back now: every room hears the rooms are closed');
check((await pass(call, 1, ana)).status === 404, 'a closed room can’t be joined');

// "They choose": Cai picks room 2 from the main call.
await leave(A1); await leave(B1); await leave(C2); await leave(T1);
const T0 = await joinRoom(call, teacher, true), C0 = await joinRoom(call, cai);
send(T0, { type: 'control', action: 'bo-open', rooms: 3, assign: {}, minutes: 0, choose: true });
await sleep(200);
check(C0.bo?.choose === true && C0.bo?.mine === null, 'they choose: no room yet');
send(C0, { type: 'bo-pick', n: 2 });
await sleep(200);
check(C0.bo?.mine === 2, 'Cai picked room 2');
check((await pass(call, 3, cai)).status === 200, 'when people choose, any room is open to them');
send(T0, { type: 'control', action: 'bo-end' });
await sleep(200);
check(C0.bo === null, 'closed again');

// The timer (only with TIMER=1: takes about 95 s): rooms close by themselves, then everyone goes back.
if (process.env.TIMER) {
  const Tt = await joinRoom('g_timer', teacher, true), At = await joinRoom('g_timer', ana);
  send(Tt, { type: 'control', action: 'bo-open', rooms: 1, assign: { [At.peerId]: 1 }, minutes: 1, choose: false });
  await sleep(300);
  await leave(At);
  const At1 = await joinRoom('g_timer~b1', ana);
  check(typeof At1.bo?.endsAt === 'number' && At1.bo.closing === null, 'timer: running in the room');
  await sleep(63_000);
  check(typeof At1.bo?.closing === 'number', 'timer: time up, the room starts closing by itself');
  await sleep(32_000);
  check(At1.bo === null && Tt.bo === null, 'timer: 30 s later the rooms are closed everywhere');
}

// ── Live polls and quick quizzes ──
{
  const Tp = await joinRoom('g_poll', teacher, true), Ap = await joinRoom('g_poll', ana), Bp = await joinRoom('g_poll', ben);
  check(Ap.welcome?.poll === null, 'polls: none yet');
  send(Ap, { type: 'control', action: 'poll-start', q: 'Hack?', options: ['a', 'b'], quiz: false, anon: true });
  await sleep(200);
  check(Tp.poll === null, 'polls: a student can’t start one');
  send(Tp, { type: 'control', action: 'poll-start', q: 'How was the reading?', options: ['Good', 'Hard', 'Didn’t read'], quiz: false, anon: true });
  await sleep(250);
  check(Ap.poll?.q === 'How was the reading?' && Ap.poll.counts === null && Ap.poll.mine === null, 'polls: everyone gets it, results hidden until you answer');
  send(Ap, { type: 'vote', id: Ap.poll.id, n: 0 });
  await sleep(150);
  check(Ap.poll?.mine === 0 && JSON.stringify(Ap.poll.counts) === '[1,0,0]', 'polls: Ana answers and sees the results at once');
  await sleep(800);
  check(Bp.poll?.counts === null && Bp.poll?.total === 1, 'polls: Ben (not answered) sees how many answered, not what');
  check(JSON.stringify(Tp.poll?.counts) === '[1,0,0]' && Tp.poll?.voters === undefined, 'polls: the host sees live counts, no names (anonymous)');
  send(Bp, { type: 'vote', id: Bp.poll.id, n: 1 });
  send(Ap, { type: 'vote', id: Ap.poll.id, n: 1 });
  await sleep(900);
  check(JSON.stringify(Tp.poll?.counts) === '[0,2,0]' && Ap.poll?.mine === 1, 'polls: changing your answer replaces it; results update');
  send(Ap, { type: 'vote', id: Ap.poll.id, n: 7 });
  await sleep(200);
  check(Ap.poll?.mine === 1, 'polls: an impossible answer is ignored');
  // A quick quiz, with names.
  send(Tp, { type: 'control', action: 'poll-start', q: '2 + 2?', options: ['3', '4'], quiz: true, correct: null, anon: false });
  await sleep(200);
  check(Ap.poll?.q === 'How was the reading?', 'quiz: one without a right answer is refused');
  send(Tp, { type: 'control', action: 'poll-start', q: '2 + 2?', options: ['3', '4'], quiz: true, correct: 1, anon: false });
  await sleep(250);
  check(Ap.poll?.quiz === true && Ap.poll.correct === null && Tp.poll?.correct === 1, 'quiz: the right answer is only the host’s');
  send(Ap, { type: 'vote', id: Ap.poll.id, n: 0 });
  await sleep(900);
  check(Ap.poll?.mine === 0 && Ap.poll.counts === null, 'quiz: after answering, still no results for students');
  check(JSON.stringify(Tp.poll?.voters) === '[["Ana"],[]]', 'quiz (named): the host sees who picked what');
  const Cp = await joinRoom('g_poll', cai);
  check(Cp.welcome?.poll?.q === '2 + 2?' && Cp.welcome.poll.correct === null, 'a late joiner gets the open quiz');
  send(Tp, { type: 'control', action: 'poll-end' });
  await sleep(250);
  check(Ap.poll?.open === false && Ap.poll.correct === 1 && JSON.stringify(Ap.poll.counts) === '[1,0]', 'quiz ends: everyone sees the answer and results');
  check(Ap.poll?.voters === undefined, 'quiz ends: students never see names');
  send(Bp, { type: 'vote', id: Bp.poll.id, n: 1 });
  await sleep(200);
  check(Bp.poll?.mine === null, 'an ended quiz takes no answers');
  send(Tp, { type: 'control', action: 'poll-clear' });
  await sleep(250);
  check(Ap.poll === null && Cp.poll === null, 'removed for everyone');
}

// ── Translated captions (Stage 4 · 4.1) ──
{
  const Tc = await joinRoom('g_cc', teacher, true), Fr1 = await joinRoom('g_cc', ana), Fr2 = await joinRoom('g_cc', ben), Hi = await joinRoom('g_cc', cai);
  send(Fr1, { type: 'cc-lang', lang: 'fr', device: false });
  send(Fr2, { type: 'cc-lang', lang: 'fr-FR', device: true });
  send(Hi, { type: 'cc-lang', lang: 'hi', device: false });
  await sleep(150);
  send(Tc, { type: 'caption', text: 'Today we start with recursion', final: true, lang: 'hi-IN' });
  await sleep(250);
  const cap = Fr1.msgs.find((m) => m.type === 'caption');
  check(cap?.lang === 'hi' && typeof cap.id === 'string' && cap.final === true, 'captions: a finished sentence carries its language and an id');
  const asked = [Fr1, Fr2, Hi].map((p) => p.msgs.filter((m) => m.type === 'cc-do').length);
  check(asked[0] === 0 && asked[1] === 1 && asked[2] === 0, 'captions: one reader per language translates, the one who can on the device; not readers of the spoken language');
  send(Fr1, { type: 'cc-tr', id: cap.id, lang: 'fr', text: 'pirate' });
  await sleep(150);
  check(!Fr2.msgs.some((m) => m.type === 'cc-tr'), 'captions: a translation nobody asked for is dropped');
  send(Fr2, { type: 'cc-tr', id: cap.id, lang: 'fr', text: 'Aujourd’hui nous commençons par la récursivité' });
  await sleep(200);
  check(Fr1.msgs.some((m) => m.type === 'cc-tr' && m.id === cap.id && m.text.startsWith('Aujourd')), 'captions: the translation reaches the other French reader');
  check(!Hi.msgs.some((m) => m.type === 'cc-tr') && !Tc.msgs.some((m) => m.type === 'cc-tr'), 'captions: and nobody else');
  send(Tc, { type: 'caption', text: 'then loops', final: false, lang: 'hi-IN' });
  await sleep(150);
  check(Fr2.msgs.filter((m) => m.type === 'cc-do').length === 1, 'captions: words in progress aren’t translated');
  send(Fr2, { type: 'cc-lang', lang: null });
  await sleep(100);
  send(Tc, { type: 'caption', text: 'Any questions?', final: true, lang: 'hi-IN' });
  await sleep(200);
  check(Fr1.msgs.filter((m) => m.type === 'cc-do').length === 1, 'captions: when the device reader turns captions off, another reader takes over');
}

// ── Classroom pulse (Stage 4 · 4.4) ──
{
  const Tq = await joinRoom('c_pulse', teacher, true), Aq = await joinRoom('c_pulse', ana), Bq = await joinRoom('c_pulse', ben), Cq = await joinRoom('c_pulse', cai);
  const last = (p) => [...p.msgs].reverse().find((m) => m.type === 'pulse');
  check(Tq.welcome?.pulse?.total === 0 && Aq.welcome?.pulse === null, 'pulse: the host gets counts on joining, students don’t');
  send(Aq, { type: 'pulse', v: 'lost' });
  send(Bq, { type: 'pulse', v: 'lost' });
  send(Cq, { type: 'pulse', v: 'got' });
  await sleep(1100);
  const p1 = last(Tq);
  check(p1?.lost === 2 && p1.got === 1 && p1.total === 3, 'pulse: the host sees 2 lost, 1 following, of 3');
  check(!Aq.msgs.some((m) => m.type === 'pulse') && !Cq.msgs.some((m) => m.type === 'pulse'), 'pulse: students never see the counts');
  check(!JSON.stringify(Tq.msgs).includes('"pulse":"lost"'), 'pulse: nobody’s tap travels with their name');
  send(Tq, { type: 'pulse', v: 'lost' });
  send(Aq, { type: 'pulse', v: 'got' });
  await sleep(1100);
  check(last(Tq)?.lost === 1 && last(Tq)?.got === 2, 'pulse: changing your mind updates the counts; hosts can’t tap');
  const Dq = await joinRoom('c_pulse', { id: 's4', name: 'Dev' });
  check(!JSON.stringify(Dq.welcome?.peers ?? []).includes('pulse'), 'pulse: a newcomer’s list of people carries nobody’s pulse');
  await leave(Bq);
  await sleep(1100);
  check(last(Tq)?.lost === 0 && last(Tq)?.total === 3, 'pulse: someone lost leaves: they no longer count');
}

// ── Webinar mode (Stage 4 · 2.10) ──
{
  const H = await joinRoom('g_web', teacher, true), A = await joinRoom('g_web', ana), B = await joinRoom('g_web', ben);
  const last = (p, type) => [...p.msgs].reverse().find((m) => m.type === type);
  send(A, { type: 'control', action: 'webinar', on: true });
  await sleep(200);
  check(!last(B, 'webinar'), 'webinar: a viewer can’t turn it on');
  send(H, { type: 'control', action: 'webinar', on: true });
  await sleep(300);
  check(last(A, 'stage')?.on === false && last(A, 'stage')?.webinar === true && !last(H, 'stage'), 'webinar: everyone but the hosts becomes audience');
  check(last(A, 'webinar')?.on === true && JSON.stringify(last(A, 'webinar').peers.map((p) => p.name)) === '["Ms Teacher"]', 'webinar: the audience now only hears about the stage');
  check(last(H, 'webinar')?.peers.length === 2 && last(H, 'webinar').audience === 2, 'webinar: hosts still see everyone, and the audience count');
  const t = await room('g_web').fetch('https://call/ticket', { method: 'POST', body: JSON.stringify({ userId: cai.id, name: cai.name, host: false, max: 50 }) });
  check((await t.json()).audience === true, 'webinar: a new ticket says “join as audience” (no camera or mic asked for)');
  const C = await joinRoom('g_web', cai);
  await sleep(150);
  check(C.welcome?.webinar?.on === true && C.welcome.peers.length === 1, 'webinar: a newcomer in the audience gets only the stage');
  check(!A.msgs.some((m) => m.type === 'joined' && m.peer.name === 'Cai') && H.msgs.some((m) => m.type === 'joined' && m.peer.name === 'Cai'), 'webinar: audience joins reach the hosts, not every viewer');
  send(A, { type: 'hand', up: true });
  await sleep(150);
  check(H.msgs.some((m) => m.type === 'hand' && m.at) && !B.msgs.some((m) => m.type === 'hand' && m.at), 'webinar: a raised hand reaches the hosts, not the other viewers');
  send(A, { type: 'caption', text: 'can you hear me', final: true, lang: 'en' });
  await sleep(150);
  check(!H.msgs.some((m) => m.type === 'caption' && m.text === 'can you hear me'), 'webinar: the audience can’t caption (they aren’t speaking)');
  // Q&A
  send(A, { type: 'qa-ask', text: 'Will this be on the exam?' });
  send(B, { type: 'qa-ask', text: 'Can you share the slides?', anon: true });
  await sleep(900);
  const q = last(C, 'qa')?.items ?? [];
  check(q.length === 2 && q.find((x) => x.text.startsWith('Can you share'))?.by === null && q.find((x) => x.text.startsWith('Will'))?.by === 'Ana', 'Q&A: everyone sees questions; anonymous ones without a name');
  check(!JSON.stringify(q).includes('s1') && !JSON.stringify(q).includes('s2'), 'Q&A: no account ids in what people see');
  const slides = q.find((x) => x.text.startsWith('Can you share')).id;
  send(C, { type: 'qa-vote', id: slides, up: true });
  send(A, { type: 'qa-vote', id: slides, up: true });
  send(A, { type: 'qa-vote', id: slides, up: true });
  await sleep(900);
  const q2 = last(C, 'qa').items;
  check(q2[0].id === slides && q2[0].votes === 2 && q2[0].mine === true, 'Q&A: upvotes (one each) put a question on top');
  send(A, { type: 'qa-ask', text: 'Another one right away' });
  await sleep(300);
  check(!last(H, 'qa').items.some((x) => x.text === 'Another one right away'), 'Q&A: one question every few seconds per person');
  send(H, { type: 'control', action: 'qa-answer', target: slides, on: true });
  await sleep(300);
  check(last(A, 'qa').items.at(-1).id === slides && last(A, 'qa').items.at(-1).answered === true, 'Q&A: answered questions move to the end');
  // Stage
  const aPeer = last(H, 'webinar').peers.find((p) => p.name === 'Ana').peerId;
  send(H, { type: 'control', action: 'stage', target: aPeer, on: true });
  await sleep(300);
  check(last(A, 'stage')?.on === true && last(A, 'webinar').stage.includes(aPeer), 'stage: Ana is brought on stage (and told so)');
  check(last(B, 'webinar').peers.some((p) => p.name === 'Ana'), 'stage: the audience now hears about Ana');
  check(H.msgs.some((m) => m.type === 'hand' && m.peerId === aPeer && m.at === null), 'stage: her hand goes down');
  send(H, { type: 'control', action: 'stage', target: aPeer, on: false });
  await sleep(300);
  check(last(A, 'stage')?.on === false && !last(B, 'webinar').peers.some((p) => p.name === 'Ana'), 'stage: back to the audience');
  send(H, { type: 'control', action: 'webinar', on: false });
  await sleep(300);
  check(last(B, 'webinar')?.on === false && last(B, 'webinar').peers.length === 3 && last(B, 'stage')?.on === true, 'webinar off: everyone hears about everyone again and may talk');
  const t2 = await room('g_web').fetch('https://call/ticket', { method: 'POST', body: JSON.stringify({ userId: cai.id, name: cai.name, host: false, max: 50 }) });
  check((await t2.json()).audience === false, 'webinar off: tickets are ordinary again');
}

// ── Guest links (Stage 4 · 2.11) ──
{
  const id = 'l_guesttest12345';
  const post = (path, body) => room(id).fetch(`https://call${path}`, { method: 'POST', body: JSON.stringify(body) });
  await post('/creator', { userId: teacher.id });
  const H = await joinRoom(id, teacher, false);
  check(H.welcome?.host === true, 'guests: the link’s creator hosts it');
  send(H, { type: 'chat', text: 'before the guest came' });
  await sleep(150);
  const { token } = await (await post('/guest-link', { by: teacher.id, hours: 1 })).json();
  check(typeof token === 'string' && (await post('/guest-ticket', { token, check: true })).status === 200, 'guests: a guest link works');
  check((await post('/guest-ticket', { token, name: 'X', ip: '9.9.9.9', max: 50 })).status === 400, 'guests: a name is needed');
  const { ticket } = await (await post('/guest-ticket', { token, name: '  Gita   Rao ', ip: '9.9.9.9', max: 50 })).json();
  const g = { msgs: [] };
  g.ws = new WebSocket(`${BASE.replace('http', 'ws')}/__do/${encodeURIComponent(id)}/call-live?call=${encodeURIComponent(id)}&ticket=${ticket}`);
  g.ws.addEventListener('message', (e) => g.msgs.push(JSON.parse(e.data)));
  await sleep(400);
  check(g.msgs.some((m) => m.type === 'lobby') && !g.msgs.some((m) => m.type === 'welcome'), 'guests: always wait in the waiting room (even with it off)');
  const knock = H.msgs.find((m) => m.type === 'knock');
  check(knock?.peer?.name === 'Gita Rao (guest)' && knock.peer.guest === true, 'guests: the host sees “(guest)” knocking');
  send(H, { type: 'control', action: 'admit', target: knock.peer.peerId });
  await sleep(300);
  const welcome = g.msgs.find((m) => m.type === 'welcome');
  check(!!welcome && Array.isArray(welcome.chat) && welcome.chat.length === 0, 'guests: let in, without the chat from before they came');
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await post('/guest-ticket', { token, name: `Guest ${i}`, ip: '5.5.5.5', max: 50 })).status);
  check(codes.slice(0, 10).every((c) => c === 200) && codes[10] === 429, 'guests: 10 tickets per network address every 10 minutes, then no more');
  await post('/guest-link', { revoke: token });
  check((await post('/guest-ticket', { token, check: true })).status === 410, 'guests: a link taken back stops working');
  g.ws.close();
}

// ── Study Hall (Stage 4 · 4.2) ──
{
  const id = 'hc_course1';
  const A = await joinRoom(id, ana), B = await joinRoom(id, ben);
  send(A, { type: 'pos', x: 300, y: 200, t: null });
  send(A, { type: 'pos', x: 320, y: 210, t: 3 });
  send(B, { type: 'pos', x: 5000, y: -40, t: 99 });
  await sleep(300);
  const batch = B.msgs.filter((m) => m.type === 'pos').flatMap((m) => m.list);
  check(batch.some((p) => p[0] === A.peerId && p[1] === 320 && p[2] === 210 && p[3] === 3), 'hall: a move reaches the others, with the table');
  check(A.msgs.filter((m) => m.type === 'pos').length === 1, 'hall: moves go out in batches, not one message each');
  check(batch.some((p) => p[0] === B.peerId && p[1] === 1200 && p[2] === 0 && p[3] === null), 'hall: places stay on the map; a table that doesn’t exist is none');
  const C = await joinRoom(id, cai);
  check(C.welcome?.peers?.find((p) => p.name === 'Ana')?.pos?.join(',') === '320,210,3', 'hall: a newcomer sees where everyone is');
  send(A, { type: 'hall-timer', on: true, focus: 25, brk: 5 });
  await sleep(200);
  const tm = [...C.msgs].reverse().find((m) => m.type === 'hall-timer');
  check(tm?.timer?.focus === 25 && tm.timer.brk === 5 && tm.by === 'Ana', 'hall: the focus timer starts for everyone');
  const D = await joinRoom(id, { id: 's9', name: 'Dee' });
  check(D.welcome?.hallTimer?.focus === 25, 'hall: a newcomer joins the running timer');
  send(B, { type: 'hall-timer', on: false });
  await sleep(200);
  check([...A.msgs].reverse().find((m) => m.type === 'hall-timer')?.timer === null, 'hall: anyone can stop it');
  const b1 = await (await room(id).fetch('https://call/hall-board?n=2', { method: 'POST', body: JSON.stringify({ boardId: 'board-a' }) })).json();
  const b2 = await (await room(id).fetch('https://call/hall-board?n=2', { method: 'POST', body: JSON.stringify({ boardId: 'board-b' }) })).json();
  check(b1.boardId === 'board-a' && b2.boardId === 'board-a', 'hall: a table keeps its first whiteboard');
}

// ── Office hours (Stage 4 · 4.7) ──
{
  const id = 'o_teacher1';
  const enter = async (user) => {
    const t = await room(id).fetch('https://call/ticket', { method: 'POST', body: JSON.stringify({ userId: user.id, name: user.name, host: false, max: 50 }) });
    const { ticket } = await t.json();
    const p = { user, msgs: [] };
    p.ws = new WebSocket(`${BASE.replace('http', 'ws')}/__do/${encodeURIComponent(id)}/call-live?call=${encodeURIComponent(id)}&ticket=${ticket}`);
    p.ws.addEventListener('message', (e) => p.msgs.push(JSON.parse(e.data)));
    await sleep(250);
    return p;
  };
  const last = (p, type) => [...p.msgs].reverse().find((m) => m.type === type);
  const A = await enter(ana), B = await enter(ben), C = await enter(cai);
  check(A.msgs.some((m) => m.type === 'lobby') && !A.msgs.some((m) => m.type === 'welcome'), 'office hours: students wait in line, even with the waiting room off');
  await sleep(200);
  check(last(A, 'queue')?.pos === 1 && last(B, 'queue')?.pos === 2 && last(C, 'queue')?.pos === 3, 'office hours: everyone hears their place in line');
  check(last(C, 'queue')?.etaMin === 10, 'office hours: and a guess of the wait (5 min a turn to start with)');
  check(last(A, 'lobby')?.hostHere === false, 'office hours: before the teacher comes, those waiting are told they aren’t in yet');
  const H = await joinRoom(id, teacher, true);
  await sleep(200);
  check(last(H, 'queue-size')?.waiting === 3, 'office hours: the teacher sees how many wait as they come in');
  check(last(A, 'lobby')?.hostHere === true, 'office hours: and those waiting hear the teacher is in');
  send(H, { type: 'control', action: 'office-next' });
  await sleep(400);
  check(A.msgs.some((m) => m.type === 'welcome'), 'office hours: Next lets the first in line in');
  check(last(B, 'queue')?.pos === 1 && last(C, 'queue')?.pos === 2, 'office hours: the others move up');
  // Cai's connection drops; Dev joins the line; Cai comes back a moment later and is still ahead of Dev.
  C.ws.close();
  await sleep(300);
  const D = await enter({ id: 's4', name: 'Dev' });
  await sleep(200);
  check(last(D, 'queue')?.pos === 2, 'office hours: someone who drops out leaves the line for now');
  const C2 = await enter(cai);
  await sleep(200);
  check(last(C2, 'queue')?.pos === 2 && last(D, 'queue')?.pos === 3, 'office hours: back within a few minutes, the same place in line');
  send(H, { type: 'control', action: 'office-next' });
  await sleep(400);
  check(last(A, 'office-done')?.by === 'Ms Teacher', 'office hours: Next thanks the student whose turn it was (their app ends the call)');
  check(B.msgs.some((m) => m.type === 'welcome') && last(C2, 'queue')?.pos === 1, 'office hours: and the next one comes in');
  const state = await (await room(id).fetch('https://call/office')).json();
  check(state.waiting === 2 && state.inTurn === 1, 'office hours: the app can see who waits and who is in a turn');
  await room(id).fetch('https://call/office', { method: 'POST', body: '{}' });
  await sleep(300);
  const after = await (await room(id).fetch('https://call/office')).json();
  check(!!last(C2, 'office-closed') && !!last(D, 'office-closed') && after.waiting === 0, 'office hours: closing tells whoever is still waiting, and the line empties');
  B.ws.close(); H.ws.close();
}

// ── Watch together (Stage 4 · 4.8) ──
{
  const id = 'c_course9';
  const last = (p, type) => [...p.msgs].reverse().find((m) => m.type === type);
  const T = await joinRoom(id, teacher, true);
  const S1 = await joinRoom(id, ana), S2 = await joinRoom(id, ben);
  send(S1, { type: 'watch', op: 'start', src: { kind: 'youtube', id: 'dQw4w9WgXcQ' } });
  await sleep(200);
  check(!last(S2, 'watch'), 'watch: in a class call, students can’t start a video');
  send(T, { type: 'watch', op: 'start', src: { kind: 'youtube', id: 'not an id!' } });
  await sleep(150);
  check(!last(S2, 'watch'), 'watch: something that isn’t a video is refused');
  send(T, { type: 'watch', op: 'start', src: { kind: 'youtube', id: 'dQw4w9WgXcQ' } });
  await sleep(200);
  const w1 = last(S2, 'watch');
  check(w1?.watch?.src?.id === 'dQw4w9WgXcQ' && w1.watch.playing && w1.watch.lock === true && w1.watch.at > w1.now, 'watch: the teacher starts a video for everyone (a moment from now, locked)');
  send(S1, { type: 'watch', op: 'pause', t: 5 });
  await sleep(150);
  check(last(S2, 'watch').watch.playing === true, 'watch: while locked, students can’t pause it for everyone');
  send(T, { type: 'watch', op: 'pause', t: 12.5 });
  await sleep(150);
  const w2 = last(S1, 'watch');
  check(w2.watch.playing === false && w2.watch.pos === 12.5 && w2.by === 'Ms Teacher', 'watch: pause for everyone');
  send(T, { type: 'watch', op: 'lock', on: false });
  await sleep(100);
  send(S1, { type: 'watch', op: 'seek', t: 30 });
  await sleep(150);
  check(last(S2, 'watch').watch.pos === 30, 'watch: unlocked, anyone moves it for everyone');
  send(S2, { type: 'react', emoji: '👏' });
  send(S1, { type: 'watch', op: 'note', text: 'Good point here' });
  await sleep(200);
  const marks = T.msgs.filter((m) => m.type === 'watch-mark').map((m) => m.mark);
  check(marks.length === 2 && marks[0].emoji === '👏' && marks[0].t === 30 && marks[1].text === 'Good point here', 'watch: reactions and comments land on the timeline where the video is');
  const late = await joinRoom(id, cai);
  check(late.welcome?.watch?.pos === 30 && late.welcome.watch.marks.length === 2 && typeof late.welcome.now === 'number', 'watch: someone joining late gets the video where it is, with its timeline');
  send(S1, { type: 'watch', op: 'stop' });
  await sleep(150);
  check(!!last(late, 'watch') === false && late.welcome.watch !== null, 'watch: only the hosts or whoever started it can stop it');
  send(T, { type: 'watch', op: 'stop' });
  await sleep(150);
  check(last(late, 'watch')?.watch === null, 'watch: stopping ends it for everyone');
  for (const p of [T, S1, S2, late]) await leave(p);
  // A study group: anyone starts one, but not over someone else's.
  const g = 'g_group9';
  const GA = await joinRoom(g, ana), GB = await joinRoom(g, ben);
  send(GA, { type: 'watch', op: 'start', src: { kind: 'file', url: '/api/files/abcdefghijklmnop1234', title: 'Lecture 3' } });
  await sleep(150);
  check(last(GB, 'watch')?.watch?.src?.kind === 'file' && last(GB, 'watch').watch.lock === false, 'watch: in a study group anyone starts one, unlocked');
  check(last(GA, 'watch').watch.mine === true && last(GB, 'watch').watch.mine === false, 'watch: each app knows whose video it is');
  send(GB, { type: 'watch', op: 'start', src: { kind: 'youtube', id: 'dQw4w9WgXcQ' } });
  await sleep(150);
  check(last(GA, 'watch').watch.src.kind === 'file', 'watch: but not over someone else’s video');
  await leave(GA); await leave(GB);
  const again = await joinRoom(g, cai);
  check(again.welcome?.watch === null, 'watch: when the call empties, the video ends');
  await leave(again);
}

// ── Recording with students under 18 (Stage 4 · 4.10) ──
{
  const last = (p, type) => [...p.msgs].reverse().find((m) => m.type === type);
  const stateOf = (p, from) => [...p.msgs].reverse().find((m) => m.type === 'state' && m.from === from);
  // The school doesn't allow it (the default): a teacher can't record with a minor in the call.
  const T = await joinRoom('c_course10', teacher, true, { recMinors: false });
  const M = await joinRoom('c_course10', ana, false, { minor: true, recMinors: false });
  check(!JSON.stringify(T.msgs).includes('"minor"'), 'recording: nobody is told who is under 18');
  send(T, { type: 'state', recording: true });
  await sleep(200);
  check(!!last(T, 'rec-blocked') && stateOf(M, T.peerId)?.recording === false, 'recording: blocked while someone under 18 is in the call');
  // Recording with adults only, then someone under 18 comes in: the recorder is told to stop.
  const T2 = await joinRoom('c_course11', teacher, true, { recMinors: false });
  const B = await joinRoom('c_course11', ben, false, { recMinors: false });
  send(T2, { type: 'state', recording: true });
  await sleep(200);
  check(!last(T2, 'rec-blocked') && stateOf(B, T2.peerId)?.recording === true, 'recording: fine with no one under 18');
  const M2 = await joinRoom('c_course11', cai, false, { minor: true, recMinors: false });
  await sleep(200);
  check(last(T2, 'rec-blocked')?.joined === true, 'recording: someone under 18 joining stops it');
  // The school allows it: recording works with minors.
  const T3 = await joinRoom('c_course12', teacher, true, { recMinors: true });
  const M3 = await joinRoom('c_course12', ana, false, { minor: true, recMinors: true });
  send(T3, { type: 'state', recording: true });
  await sleep(200);
  check(!last(T3, 'rec-blocked') && stateOf(M3, T3.peerId)?.recording === true, 'recording: allowed when the school allows it');
  for (const p of [T, M, T2, B, M2, T3, M3]) await leave(p);
}

// An ordinary call (no breakouts) still works as before.
const X = await joinRoom('l_somecalllink123', { id: 'x1', name: 'Xi' });
check(X.welcome?.bo === null && X.welcome?.room === null, 'ordinary calls: no breakout state');

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
if (failures) console.log(devLog.split('\n').filter((l) => /error|Error|✘/.test(l)).slice(-15).join('\n'));
dev.kill();
process.exit(failures ? 1 : 0);
