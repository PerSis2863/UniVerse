// M150 (dev server or built Worker): Relief's "I'm safe" check-in through the API. A coordinator (the demo
// student, who starts an organisation with a base) declares an emergency; a volunteer who joined with the
// code and someone outside can't, nor can anyone end it. The teacher says "I'm safe" and tells the student
// (they have a conversation) and Alice (they don't): only the student is told and sees it; telling again
// adds nobody twice. Once it's ended, "I'm safe" is refused and it leaves the list. Signed out: nothing.
// M153: a helper's phone number for emergency texts is checked and kept; texts are off locally.
//   node scripts/checks/relief-safety-api.mjs [http://localhost:8787]
const root = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3100';
const fail = [];
const out = [];
const call = async (method, path, who, body, api = '/api/core') => {
  const headers = { 'Content-Type': 'application/json', ...(who && { Authorization: `Bearer mock-token-${who}` }) };
  const r = await fetch(root + api + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const COORD = 'demo@student.com', VOL = 'demo@teacher.com', STRANGER = 'alice@student.com';
const idOf = async (who) => (await call('GET', '/users/me', who)).data?.id;
const [coordId, strangerId] = [await idOf(COORD), await idOf(STRANGER)];

// The teacher and the student talk; the teacher and Alice don't (unless an earlier run made it so).
await call('POST', '/messages', VOL, { receiverId: coordId, body: 'Are you near the river?' });
const volContacts = (await call('GET', '/relief/contacts', VOL)).data?.contacts ?? [];
if (!volContacts.some((c) => c.id === coordId)) fail.push(`the teacher's contacts lack the student: ${JSON.stringify(volContacts).slice(0, 200)}`);
const strangerIsContact = volContacts.some((c) => c.id === strangerId);
if (volContacts.some((c) => 'email' in c)) fail.push('contacts carry emails');

// Reuse a test organisation from an earlier run (a person can start 5).
const had = ((await call('GET', '/relief/orgs', COORD)).data?.orgs ?? []).find((o) => o.role === 'OWNER' && o.name.startsWith('Check '));
const org = had ? { data: had } : await call('POST', '/relief/orgs', COORD, { name: `Check Safety ${Date.now()}`, kind: 'NGO', place: 'Chennai', lat: 13.0827, lng: 80.2707 });
const orgId = org.data?.id ?? org.data?.org?.id;
if (!orgId) fail.push(`organisation: ${org.status} ${JSON.stringify(org.data).slice(0, 200)}`);
else {
  const code = (await call('GET', `/relief/orgs/${orgId}`, COORD)).data?.org?.code;
  await call('POST', '/relief/orgs/join', VOL, { code });
  const title = `Check flood ${Date.now()}`;
  // M153: emergency texts: a bad number is refused, a good one kept for the helper alone; off locally.
  const badPhone = await call('PUT', '/relief/watch', STRANGER, { lat: 13.0827, lng: 80.2707, radiusKm: 5, sms: true, smsTo: '12345' });
  if (badPhone.status !== 400) fail.push(`a bad phone number: ${badPhone.status}`);
  const phone = await call('PUT', '/relief/watch', STRANGER, { lat: 13.0827, lng: 80.2707, radiusKm: 5, sms: true, smsTo: '+91 98765 43210' });
  if (phone.data?.smsTo !== '+919876543210') fail.push(`the phone number: ${JSON.stringify(phone.data)}`);
  const smsOn = await call('GET', '/relief/sms', STRANGER);
  if (smsOn.data?.on !== false) fail.push(`emergency texts should be off locally: ${JSON.stringify(smsOn.data)}`);
  const byVol = await call('POST', '/relief/incidents', VOL, { orgId, title });
  if (byVol.status !== 403) fail.push(`a volunteer declaring: ${byVol.status}`);
  const byStranger = await call('POST', '/relief/incidents', STRANGER, { orgId, title });
  if (byStranger.status !== 403) fail.push(`an outsider declaring: ${byStranger.status}`);
  const empty = await call('POST', '/relief/incidents', COORD, { orgId, title: '  ' });
  if (empty.status !== 400) fail.push(`no title: ${empty.status}`);
  const made = await call('POST', '/relief/incidents', COORD, { orgId, title, radiusKm: 9999, hours: 1 });
  const id = made.data?.id;
  if (!id) fail.push(`declaring: ${made.status} ${JSON.stringify(made.data).slice(0, 200)}`);
  else {
    // Out-of-range numbers fall back to the defaults: 20 km, 3 days.
    if (made.data.radiusKm !== 20) fail.push(`radius: ${made.data.radiusKm}`);
    const hours = (new Date(made.data.endsAt).getTime() - Date.now()) / 3_600_000;
    if (hours < 71.9 || hours > 72.1) fail.push(`length: ${hours.toFixed(2)} h`);
    const endByVol = await call('POST', `/relief/incidents/${id}/end`, VOL);
    if (endByVol.status !== 403) fail.push(`a volunteer ending it: ${endByVol.status}`);

    const seen = (await call('GET', '/relief/incidents', STRANGER)).data?.incidents?.find((i) => i.id === id);
    if (!seen) fail.push('someone outside the organisation does not see the emergency');
    else if (seen.canEnd || seen.safeAt) fail.push(`the outsider's view: ${JSON.stringify(seen)}`);

    const safe = await call('POST', `/relief/incidents/${id}/safe`, VOL, { tell: [coordId, strangerId, 'nobody'] });
    if (!safe.data?.ok) fail.push(`"I'm safe": ${safe.status} ${JSON.stringify(safe.data)}`);
    if (safe.data?.told !== (strangerIsContact ? 2 : 1)) fail.push(`told ${safe.data?.told}, expected ${strangerIsContact ? 2 : 1}`);
    const again = await call('POST', `/relief/incidents/${id}/safe`, VOL, { tell: [coordId] });
    if (again.data?.told !== safe.data?.told) fail.push(`telling again changed the count: ${again.data?.told}`);

    const coordView = (await call('GET', '/relief/incidents', COORD)).data?.incidents?.find((i) => i.id === id);
    const told = coordView?.safeContacts ?? [];
    if (told.length !== 1 || !coordView.canEnd) fail.push(`the student's view: ${JSON.stringify(coordView)}`);
    if (told.some((t) => 'email' in t || 'id' in t)) fail.push('who is safe carries ids or emails');
    if (!strangerIsContact) {
      const strangerView = (await call('GET', '/relief/incidents', STRANGER)).data?.incidents?.find((i) => i.id === id);
      if (strangerView?.safeContacts?.length) fail.push('Alice was told though she has no conversation with the teacher');
    }
    const volView = (await call('GET', '/relief/incidents', VOL)).data?.incidents?.find((i) => i.id === id);
    if (!volView?.safeAt || volView.told !== safe.data?.told) fail.push(`the teacher's own view: ${JSON.stringify(volView)}`);
    out.push(`told ${safe.data?.told}; the student sees: ${told.map((t) => t.name).join(', ')}`);

    const n = await call('GET', '/notifications', COORD, null, '/api');
    const list = Array.isArray(n.data) ? n.data : n.data?.notifications ?? n.data?.items ?? [];
    if (!list.some((x) => (x.body ?? '').includes(title) && / is safe$/.test(x.title))) fail.push('the student got no "is safe" notification');

    const ended = await call('POST', `/relief/incidents/${id}/end`, COORD);
    if (!ended.data?.ok) fail.push(`ending: ${ended.status}`);
    const late = await call('POST', `/relief/incidents/${id}/safe`, STRANGER, { tell: [] });
    if (late.status !== 404) fail.push(`"I'm safe" after the end: ${late.status}`);
    const after = (await call('GET', '/relief/incidents', COORD)).data?.incidents ?? [];
    if (after.some((i) => i.id === id)) fail.push('still listed after the end');
  }
  await call('DELETE', '/relief/watch', STRANGER);
  const anon = await call('GET', '/relief/incidents', null);
  if (anon.status !== 401) fail.push(`signed out: ${anon.status}`);
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
