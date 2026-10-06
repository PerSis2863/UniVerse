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
async function joinRoom(callId, user, host = false) {
  const t = await room(callId).fetch('https://call/ticket', { method: 'POST', body: JSON.stringify({ userId: user.id, name: user.name, host, max: 50 }) });
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

// An ordinary call (no breakouts) still works as before.
const X = await joinRoom('l_somecalllink123', { id: 'x1', name: 'Xi' });
check(X.welcome?.bo === null && X.welcome?.room === null, 'ordinary calls: no breakout state');

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
if (failures) console.log(devLog.split('\n').filter((l) => /error|Error|✘/.test(l)).slice(-15).join('\n'));
dev.kill();
process.exit(failures ? 1 : 0);
