// M145 (dev server or built Worker): repair and resale history through the API. A brand (the demo
// student) makes a product and a batch; a unit is checked and owned by someone else (the demo teacher);
// the owner logs a repair (by its owner), the brand logs one (by the brand), a stranger is refused, and
// the passport lists both, newest first. Only the brand and the owner can add.
//   node scripts/checks/trace-history-api.mjs [http://localhost:8787]
const base = (process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3100') + '/api/core';
const fail = [];
const out = [];
const as = (email) => ({ 'Content-Type': 'application/json', Authorization: `Bearer mock-token-${email}` });
const call = async (method, path, who, body) => {
  const r = await fetch(base + path, { method, headers: who ? as(who) : { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const BRAND = 'demo@student.com', OWNER = 'demo@teacher.com', STRANGER = 'alice@student.com';
await call('POST', '/trace/brand', BRAND, { name: 'Check Outdoor Co', category: 'Clothing' });
const product = await call('POST', '/trace/products', BRAND, { name: `Rain jacket ${Date.now()}`, category: 'Clothing', rewardPoints: 0 });
if (product.status >= 300) fail.push(`product: ${product.status} ${JSON.stringify(product.data)}`);
const batch = await call('POST', `/trace/products/${product.data?.id}/batches`, BRAND, { label: 'Check run', quantity: 3 });
if (batch.status >= 300) fail.push(`batch: ${batch.status} ${JSON.stringify(batch.data)}`);
const codes = await call('GET', `/trace/batches/${batch.data?.id}/codes?from=0&count=1`, BRAND);
const code = codes.data?.codes?.[0]?.code ?? codes.data?.[0]?.code ?? codes.data?.codes?.[0];
if (!code) fail.push(`no code: ${JSON.stringify(codes.data).slice(0, 200)}`);
else {
  const c = encodeURIComponent(code);
  const first = await call('POST', `/trace/scan/${c}`, null, {});
  if (first.data?.history?.canLog !== false) fail.push(`anyone could add a repair: ${JSON.stringify(first.data?.history)}`);
  const own = await call('POST', `/trace/scan/${c}/own`, OWNER);
  if (own.status >= 300) fail.push(`own: ${own.status} ${JSON.stringify(own.data)}`);
  const byOwner = await call('POST', `/trace/scan/${c}/repairs`, OWNER, { what: 'New zip', parts: 'YKK zip' });
  if (byOwner.data?.by !== 'OWNER') fail.push(`owner's repair: ${byOwner.status} ${JSON.stringify(byOwner.data)}`);
  const byBrand = await call('POST', `/trace/scan/${c}/repairs`, BRAND, { what: 'Seams resealed' });
  if (byBrand.data?.by !== 'BRAND') fail.push(`brand's repair: ${byBrand.status} ${JSON.stringify(byBrand.data)}`);
  const stranger = await call('POST', `/trace/scan/${c}/repairs`, STRANGER, { what: 'Fake repair' });
  if (stranger.status !== 403) fail.push(`a stranger got ${stranger.status}`);
  const empty = await call('POST', `/trace/scan/${c}/repairs`, OWNER, { what: '  ' });
  if (empty.status !== 400) fail.push(`an empty repair got ${empty.status}`);
  const after = await call('POST', `/trace/scan/${c}`, OWNER, { again: true });
  const list = after.data?.history?.repairs ?? [];
  if (list.length !== 2 || list[0].by !== 'BRAND' || list[1].what !== 'New zip') fail.push(`passport history: ${JSON.stringify(list)}`);
  if (after.data?.history?.canLog !== true) fail.push('the owner can’t add a repair on the passport');
  out.push(`unit ${code}: ${list.map((r) => `${r.by}: ${r.what}`).join(' · ')}`);
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
