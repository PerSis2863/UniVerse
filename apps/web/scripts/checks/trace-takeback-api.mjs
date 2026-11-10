// M146 (dev server or built Worker): take-back for recycling through the API. A brand (demo student)
// offers it on a product (20 points); the unit's owner (demo teacher) asks and gets a drop-off code (only
// they see it); asking twice, or a stranger asking, is refused; only the brand lists and receives it,
// once; the owner then has 20 TAKEBACK points and a confirmed recycling action in Green.
//   node scripts/checks/trace-takeback-api.mjs [http://localhost:8787]
const base = (process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3100') + '/api/core';
const fail = [];
const out = [];
const call = async (method, path, who, body) => {
  const headers = { 'Content-Type': 'application/json', ...(who && { Authorization: `Bearer mock-token-${who}` }) };
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const BRAND = 'demo@student.com', OWNER = 'demo@teacher.com', STRANGER = 'alice@student.com';
await call('POST', '/trace/brand', BRAND, { name: 'Check Outdoor Co' });
const product = await call('POST', '/trace/products', BRAND, { name: `Water bottle ${Date.now()}`, category: 'Home', rewardPoints: 0, weightKg: 0.5, takeBackHow: 'Bring it to any of our shops', takeBackPoints: 20 });
const batch = await call('POST', `/trace/products/${product.data?.id}/batches`, BRAND, { label: 'Take-back check', quantity: 2 });
const codes = await call('GET', `/trace/batches/${batch.data?.id}/codes?from=0&count=1`, BRAND);
const code = codes.data?.codes?.[0]?.code ?? codes.data?.codes?.[0];
if (!code) { fail.push(`no code: ${JSON.stringify(codes.data).slice(0, 200)}`); }
else {
  const c = encodeURIComponent(code);
  const seen = await call('POST', `/trace/scan/${c}`, null, {});
  if (seen.data?.takeBack?.how !== 'Bring it to any of our shops' || seen.data?.takeBack?.points !== 20) fail.push(`the passport's offer: ${JSON.stringify(seen.data?.takeBack)}`);
  const notOwner = await call('POST', `/trace/scan/${c}/takeback`, OWNER);
  if (notOwner.status !== 403) fail.push(`before owning it: ${notOwner.status}`);
  await call('POST', `/trace/scan/${c}/own`, OWNER);
  const asked = await call('POST', `/trace/scan/${c}/takeback`, OWNER);
  if (asked.data?.status !== 'ASKED' || !/^[A-Z0-9]{6}$/.test(asked.data?.dropCode ?? '')) fail.push(`asking: ${asked.status} ${JSON.stringify(asked.data)}`);
  const again = await call('POST', `/trace/scan/${c}/takeback`, OWNER);
  if (again.status !== 400) fail.push(`asking twice: ${again.status}`);
  const stranger = await call('POST', `/trace/scan/${c}/takeback`, STRANGER);
  if (stranger.status !== 403) fail.push(`a stranger asking: ${stranger.status}`);
  const theirView = await call('POST', `/trace/scan/${c}`, STRANGER, { again: true });
  if (theirView.data?.takeBack?.dropCode !== null || theirView.data?.takeBack?.status !== 'ASKED') fail.push(`a stranger sees: ${JSON.stringify(theirView.data?.takeBack)}`);
  const notBrand = await call('GET', '/trace/takebacks', OWNER);
  if (notBrand.status !== 403) fail.push(`the owner listing the brand's take-backs: ${notBrand.status}`);
  const list = await call('GET', '/trace/takebacks', BRAND);
  const row = (list.data ?? []).find((r) => r.dropCode === asked.data?.dropCode);
  if (!row || row.status !== 'ASKED') fail.push(`the brand's list: ${JSON.stringify(list.data).slice(0, 200)}`);
  const wrongBrand = await call('POST', `/trace/takebacks/${row?.id}/receive`, OWNER);
  if (wrongBrand.status !== 403) fail.push(`the owner receiving it: ${wrongBrand.status}`);
  const recv = await call('POST', `/trace/takebacks/${row?.id}/receive`, BRAND);
  if (!recv.data?.ok) fail.push(`receiving: ${recv.status} ${JSON.stringify(recv.data)}`);
  const twice = await call('POST', `/trace/takebacks/${row?.id}/receive`, BRAND);
  if (twice.status !== 400) fail.push(`receiving twice: ${twice.status}`);
  const wallet = await call('GET', '/trace/wallet', OWNER);
  const paid = JSON.stringify(wallet.data).includes('"TAKEBACK"');
  if (!paid) fail.push('no TAKEBACK points in the owner’s wallet');
  const green = await call('GET', '/green/me', OWNER);
  if (!JSON.stringify(green.data ?? {}).includes('for recycling')) fail.push('no recycling action in Green');
  const after = await call('POST', `/trace/scan/${c}`, OWNER, { again: true });
  if (after.data?.takeBack?.status !== 'RECEIVED') fail.push(`the passport after: ${JSON.stringify(after.data?.takeBack)}`);
  out.push(`unit ${code}: drop-off ${asked.data?.dropCode}, received, points ${paid ? 'paid' : 'missing'}`);
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
