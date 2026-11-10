// M148 (dev server or built Worker): Relief's shelter board through the API. A coordinator (the demo
// student, who starts an organisation with a base) shares its status; a volunteer who joined with the
// code can't; beds free never exceed the beds; the board lists it for anyone signed in, with no join
// code and nobody's details; signed out gets nothing.
//   node scripts/checks/relief-places-api.mjs [http://localhost:8787]
const base = (process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3100') + '/api/core';
const fail = [];
const out = [];
const call = async (method, path, who, body) => {
  const headers = { 'Content-Type': 'application/json', ...(who && { Authorization: `Bearer mock-token-${who}` }) };
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const COORD = 'demo@student.com', VOL = 'demo@teacher.com', ANYONE = 'alice@student.com';
const name = `Check Shelter ${Date.now()}`;
const org = await call('POST', '/relief/orgs', COORD, { name, kind: 'SHELTER', place: 'Chennai', lat: 13.0827, lng: 80.2707 });
const id = org.data?.id ?? org.data?.org?.id;
if (!id) fail.push(`organisation: ${org.status} ${JSON.stringify(org.data).slice(0, 200)}`);
else {
  const full = await call('GET', `/relief/orgs/${id}`, COORD);
  const code = full.data?.org?.code;
  const joined = await call('POST', '/relief/orgs/join', VOL, { code });
  if (joined.status >= 300) fail.push(`joining: ${joined.status} ${JSON.stringify(joined.data)}`);
  const byVol = await call('PUT', `/relief/orgs/${id}/status`, VOL, { openNow: true, bedsFree: 5, bedsTotal: 10 });
  if (byVol.status !== 403) fail.push(`a volunteer sharing the status: ${byVol.status}`);
  const set = await call('PUT', `/relief/orgs/${id}/status`, COORD, { openNow: true, bedsFree: 80, bedsTotal: 40, water: 'YES', food: 'LOW', power: 'NOPE', statusNote: 'Pets welcome' });
  if (!set.data?.ok) fail.push(`sharing: ${set.status} ${JSON.stringify(set.data)}`);
  const board = await call('GET', '/relief/places', ANYONE);
  const p = (board.data?.places ?? []).find((x) => x.id === id);
  if (!p) fail.push('not on the board');
  else {
    if (p.bedsFree !== 40 || p.bedsTotal !== 40) fail.push(`beds: ${p.bedsFree} of ${p.bedsTotal}`);
    if (p.food !== 'LOW' || p.power !== null || p.statusNote !== 'Pets welcome') fail.push(`stock: ${JSON.stringify(p)}`);
    if ('code' in p || 'createdById' in p || 'textNumber' in p) fail.push(`the board leaks: ${Object.keys(p).join(', ')}`);
    out.push(`${p.name}: ${p.bedsFree} of ${p.bedsTotal} beds, water ${p.water}, food ${p.food}`);
  }
  const anon = await call('GET', '/relief/places', null);
  if (anon.status !== 401) fail.push(`signed out: ${anon.status}`);
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
