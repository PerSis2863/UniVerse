// M151 (dev server or built Worker): Relief's traceable aid through the API. A coordinator (the demo
// student, who starts an organisation) packs a box; a volunteer who joined can't pack but logs it on the
// way; someone outside can't. Signed out, the public trip shows the organisation, towns and notes but no
// people, ids or join code; a signed-in donor follows it and hears "delivered"; after delivery nothing
// moves it; a wrong code is 404; /aid/demo is a sample.
//   node scripts/checks/relief-aid-api.mjs [http://localhost:8787]
const root = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3100';
const fail = [];
const out = [];
const call = async (method, path, who, body, api = '/api/core') => {
  const headers = { 'Content-Type': 'application/json', ...(who && { Authorization: `Bearer mock-token-${who}` }) };
  const r = await fetch(root + api + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const COORD = 'demo@student.com', VOL = 'demo@teacher.com', DONOR = 'alice@student.com';

// Reuse a test organisation from an earlier run (a person can start 5).
const had = ((await call('GET', '/relief/orgs', COORD)).data?.orgs ?? []).find((o) => o.role === 'OWNER' && o.name.startsWith('Check '));
const org = had ? { data: had } : await call('POST', '/relief/orgs', COORD, { name: `Check Aid ${Date.now()}`, kind: 'NGO', place: 'Chennai', lat: 13.0827, lng: 80.2707 });
const orgId = org.data?.id ?? org.data?.org?.id;
if (!orgId) fail.push(`organisation: ${org.status} ${JSON.stringify(org.data).slice(0, 200)}`);
else {
  const joinCode = (await call('GET', `/relief/orgs/${orgId}`, COORD)).data?.org?.code;
  await call('POST', '/relief/orgs/join', VOL, { code: joinCode });
  const contents = `Check kits ${Date.now()}`;
  const byVol = await call('POST', `/relief/orgs/${orgId}/aid`, VOL, { contents, toPlace: 'Kochi' });
  if (byVol.status !== 403) fail.push(`a volunteer packing: ${byVol.status}`);
  const noPlace = await call('POST', `/relief/orgs/${orgId}/aid`, COORD, { contents });
  if (noPlace.status !== 400) fail.push(`no destination: ${noPlace.status}`);
  const box = await call('POST', `/relief/orgs/${orgId}/aid`, COORD, { contents, boxes: 12, toPlace: 'Kochi' });
  const { id, code } = box.data ?? {};
  if (!id || !/^[A-HJ-NP-Z2-9]{10}$/.test(code ?? '')) fail.push(`packing: ${box.status} ${JSON.stringify(box.data).slice(0, 200)}`);
  else {
    if (box.data.fromPlace !== 'Chennai' || box.data.boxes !== 12) fail.push(`the box: ${JSON.stringify(box.data)}`);
    const list = await call('GET', `/relief/orgs/${orgId}/aid`, VOL);
    if (!list.data?.boxes?.some((b) => b.id === id) || list.data.run) fail.push(`the volunteer's list: ${JSON.stringify(list.data).slice(0, 200)}`);
    if ((await call('GET', `/relief/orgs/${orgId}/aid`, DONOR)).status !== 404) fail.push('an outsider sees the list');

    const follow = await call('POST', `/relief/aid/${code}/follow`, DONOR, { on: true });
    if (!follow.data?.following || follow.data.followers !== 1) fail.push(`following: ${JSON.stringify(follow.data)}`);
    if (!(await call('GET', `/relief/aid/${code}/follow`, DONOR)).data?.following) fail.push('not following after following');

    const byOutsider = await call('POST', `/relief/aid/${id}/step`, DONOR, { status: 'DELIVERED' });
    if (byOutsider.status !== 404) fail.push(`an outsider moving it: ${byOutsider.status}`);
    const back = await call('POST', `/relief/aid/${id}/step`, VOL, { status: 'PACKED' });
    if (back.status !== 400) fail.push(`moving it back to packed: ${back.status}`);
    const way = await call('POST', `/relief/aid/${id}/step`, VOL, { status: 'ON_THE_WAY', place: 'Coimbatore', note: 'By truck' });
    if (way.data?.status !== 'ON_THE_WAY') fail.push(`on the way: ${way.status} ${JSON.stringify(way.data)}`);
    const done = await call('POST', `/relief/aid/${id}/step`, COORD, { status: 'DELIVERED', note: 'Handed to the camp kitchen' });
    if (done.data?.step?.place !== 'Kochi') fail.push(`delivered (place defaults to the destination): ${JSON.stringify(done.data)}`);
    const again = await call('POST', `/relief/aid/${id}/step`, VOL, { status: 'ON_THE_WAY' });
    if (again.status !== 400) fail.push(`moved after delivery: ${again.status}`);

    const pub = await call('GET', `/relief/aid/${code.toLowerCase().replace(/(.{5})/, '$1-')}`, null);
    const trip = pub.data;
    if (pub.status !== 200 || trip?.status !== 'DELIVERED' || trip.steps?.length !== 3) fail.push(`the public trip: ${pub.status} ${JSON.stringify(trip).slice(0, 300)}`);
    else {
      // Exactly these fields, nothing about people or the organisation's join code.
      const keys = (o) => Object.keys(o ?? {}).sort().join(',');
      if (keys(trip) !== 'boxes,code,contents,createdAt,followers,fromPlace,org,status,steps,toPlace,updatedAt') fail.push(`the trip's fields: ${keys(trip)}`);
      if (keys(trip.org) !== 'kind,name,place') fail.push(`the organisation's fields: ${keys(trip.org)}`);
      if (trip.steps.some((st) => keys(st) !== 'createdAt,note,place,status')) fail.push(`a step's fields: ${keys(trip.steps[0])}`);
      if (!trip.org?.name?.startsWith('Check ')) fail.push(`the organisation: ${JSON.stringify(trip.org)}`);
      out.push(`${trip.contents}: ${trip.steps.map((s) => `${s.status} ${s.place ?? ''}`.trim()).join(' → ')}; ${trip.followers} following`);
    }
    const n = await call('GET', '/notifications', DONOR, null, '/api');
    const notes = (Array.isArray(n.data) ? n.data : n.data?.notifications ?? n.data?.items ?? []).filter((x) => (x.body ?? '').includes(contents)).map((x) => x.title);
    if (!notes.includes('The aid you follow was delivered') || !notes.includes('The aid you follow is on the way')) fail.push(`the donor heard: ${JSON.stringify(notes)}`);
    const off = await call('POST', `/relief/aid/${code}/follow`, DONOR, { on: false });
    if (off.data?.following !== false || off.data.followers !== 0) fail.push(`unfollowing: ${JSON.stringify(off.data)}`);
    if ((await call('GET', `/relief/aid/${code}/follow`, null)).status !== 401) fail.push('following state answered signed out');
  }
  if ((await call('GET', '/relief/aid/ZZZZZZZZZZ', null)).status !== 404) fail.push('a wrong code was not 404');
  const demo = await call('GET', '/relief/aid/demo', null);
  if (demo.data?.code !== 'DEMO' || !demo.data.steps?.length) fail.push(`the sample: ${demo.status}`);
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
