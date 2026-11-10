// M149 (dev server or built Worker): Relief's skills matching through the API. A helper with first aid
// (alerts: urgent only, food only) and a helper who wants every need set their alerts near Chennai; a
// need for first aid (medium urgency) goes up: the first-aider hears "Your skill is needed", the other
// the usual alert; a skill that isn't on the list is dropped; offers carry no skill.
//   node scripts/checks/relief-skills-api.mjs [http://localhost:8787]
const root = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3100';
const fail = [];
const out = [];
const call = async (method, path, who, body, api = '/api/core') => {
  const headers = { 'Content-Type': 'application/json', ...(who && { Authorization: `Bearer mock-token-${who}` }) };
  const r = await fetch(root + api + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const ASKER = 'demo@student.com', MEDIC = 'demo@teacher.com', ANYONE = 'alice@student.com';
const at = { lat: 13.0827 + Math.random() * 0.01, lng: 80.2707 };
const w1 = await call('PUT', '/relief/watch', MEDIC, { ...at, radiusKm: 5, urgentOnly: true, kinds: ['FOOD'], skills: ['FIRST_AID', 'NOT_A_SKILL'] });
if (w1.data?.skills !== 'FIRST_AID') fail.push(`the medic's skills: ${JSON.stringify(w1.data)}`);
await call('PUT', '/relief/watch', ANYONE, { ...at, radiusKm: 5, urgentOnly: false });
const title = `Cut hand needs dressing ${Date.now()}`;
const post = await call('POST', '/relief/posts', ASKER, { type: 'NEED', kind: 'MEDICAL', title, urgency: 'MEDIUM', people: 1, skill: 'FIRST_AID', ...at });
if (post.data?.skill !== 'FIRST_AID') fail.push(`the need: ${post.status} ${JSON.stringify(post.data).slice(0, 200)}`);
const offer = await call('POST', '/relief/posts', ASKER, { type: 'OFFER', kind: 'TRANSPORT', title: 'I can drive', skill: 'DRIVING', ...at });
if (offer.data?.skill !== null) fail.push(`an offer kept a skill: ${offer.data?.skill}`);
await call('POST', `/relief/posts/${offer.data?.id}/close`, ASKER);
const mine = async (who) => {
  const n = await call('GET', '/notifications', who, null, '/api');
  const list = Array.isArray(n.data) ? n.data : n.data?.notifications ?? n.data?.items ?? [];
  return list.filter((x) => (x.body ?? '').includes(title)).map((x) => x.title);
};
const medic = await mine(MEDIC), anyone = await mine(ANYONE), asker = await mine(ASKER);
out.push(`medic: ${medic.join(' | ')}`, `anyone: ${anyone.join(' | ')}`);
if (!medic.some((t) => t === 'Your skill is needed: First aid')) fail.push(`the medic heard: ${JSON.stringify(medic)}`);
if (!anyone.some((t) => /needed near you$/.test(t)) || anyone.some((t) => t.startsWith('Your skill'))) fail.push(`the other helper heard: ${JSON.stringify(anyone)}`);
if (asker.length) fail.push('the person who asked was alerted');
await call('POST', `/relief/posts/${post.data?.id}/close`, ASKER);
await call('DELETE', '/relief/watch', MEDIC);
await call('DELETE', '/relief/watch', ANYONE);
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
