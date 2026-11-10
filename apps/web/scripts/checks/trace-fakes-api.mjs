// M147 (dev server or built Worker): reports of fake labels through the API. A genuine unit can't be
// reported; one checked far from its first check (a likely copy) can, once per person, signed in only;
// the brand's Radar lists the shop with its count, and never who reported.
//   node scripts/checks/trace-fakes-api.mjs [http://localhost:8787]
const base = (process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3100') + '/api/core';
const fail = [];
const out = [];
const call = async (method, path, who, body) => {
  const headers = { 'Content-Type': 'application/json', ...(who && { Authorization: `Bearer mock-token-${who}` }) };
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const BRAND = 'demo@student.com', BUYER = 'alice@student.com';
await call('POST', '/trace/brand', BRAND, { name: 'Check Outdoor Co' });
const product = await call('POST', '/trace/products', BRAND, { name: `Perfume ${Date.now()}`, category: 'Beauty', rewardPoints: 0 });
const batch = await call('POST', `/trace/products/${product.data?.id}/batches`, BRAND, { label: 'Fakes check', quantity: 2 });
const codes = await call('GET', `/trace/batches/${batch.data?.id}/codes?from=0&count=2`, BRAND);
const [good, copied] = (codes.data?.codes ?? []).map((c) => encodeURIComponent(c.code ?? c));
if (!good || !copied) fail.push(`no codes: ${JSON.stringify(codes.data).slice(0, 200)}`);
else {
  await call('POST', `/trace/scan/${good}`, null, { lat: 48.85, lng: 2.35 });
  const genuine = await call('POST', `/trace/scan/${good}/report`, BUYER, { shop: 'Nice shop' });
  if (genuine.status !== 400) fail.push(`reporting a genuine unit: ${genuine.status}`);
  await call('POST', `/trace/scan/${copied}`, null, { lat: 48.85, lng: 2.35 });
  const far = await call('POST', `/trace/scan/${copied}`, BUYER, { lat: -33.86, lng: 151.2 });
  out.push(`second check far away: ${far.data?.result}`);
  if (far.data?.result !== 'SUSPECT') fail.push(`a far-away check wasn't a likely copy: ${far.data?.result}`);
  const anon = await call('POST', `/trace/scan/${copied}/report`, null, { shop: 'Anon' });
  if (anon.status !== 401) fail.push(`signed out: ${anon.status}`);
  const empty = await call('POST', `/trace/scan/${copied}/report`, BUYER, { shop: ' ' });
  if (empty.status !== 400) fail.push(`no shop: ${empty.status}`);
  const sent = await call('POST', `/trace/scan/${copied}/report`, BUYER, { shop: 'Bargain Perfumes', area: 'Sydney', price: '$12', lat: -33.8612, lng: 151.2099 });
  if (!sent.data?.ok) fail.push(`report: ${sent.status} ${JSON.stringify(sent.data)}`);
  const again = await call('POST', `/trace/scan/${copied}/report`, BUYER, { shop: 'Bargain Perfumes' });
  if (again.status !== 400) fail.push(`reporting twice: ${again.status}`);
  const radar = await call('GET', '/trace/radar', BRAND);
  const row = (radar.data?.copiesSold ?? []).find((c) => c.shop === 'Bargain Perfumes');
  if (!row || row.reports !== 1 || row.area !== 'Sydney') fail.push(`radar: ${JSON.stringify(radar.data?.copiesSold)}`);
  if (JSON.stringify(radar.data).includes('alice')) fail.push('the radar names the reporter');
  out.push(`radar: ${row ? `${row.shop}, ${row.area}, ${row.reports} report` : 'missing'}`);
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
