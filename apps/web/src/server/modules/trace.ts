import type { Router } from '../router';
import { getSessionUser, type SessionUser } from '@/lib/server-auth';
import { first } from '../body';
import { audit } from '../audit';
import { addEvent, allBrands, batchCodes, batchDetail, brandInfo, brandOf, claim, createBatch, createBrand, createProduct, deleteProduct, flagCode, listProducts, overview, scan, setPlan, updateBrand, updateProduct } from '../trace';
import { brandCashouts, decideCashout, requestCashout, wallet } from '../trace-wallet';
import { createCampaign, listCampaigns, setCampaignStatus } from '../trace-campaigns';
import { carrierLink, carryArrive, carryInfo, carryPing, liveScans, marketMap, tracking } from '../trace-map';
import { demo } from '../trace-demo';

// UniVerse Trace (src/server/trace*.ts): every product gets a passport. Anyone can check a code or
// share a shipment's position from a driver's link (no sign-in); anyone signed in has a wallet and can
// start a brand for free; the brand's own routes check membership (brandOf), not the school role.

export default function traceModule(router: Router) {
  const r = router.controller('trace');
  const brandId = async (u: SessionUser) => (await brandOf(u)).id;

  // Anyone
  // Public routes get no user, so a signed-in shop is looked up here (it decides whether points are offered).
  r.post<{ code: string }>('scan/:code', { public: true, status: 200 }, async ({ params, body, req }) => scan(params.code, body ?? {}, await getSessionUser(req).catch(() => null), req));
  r.get<{ key: string }>('carry/:key', { public: true }, ({ params }) => carryInfo(params.key));
  r.post<{ key: string }>('carry/:key/ping', { public: true, status: 200 }, ({ params, body }) => carryPing(params.key, body ?? {}));
  r.post<{ key: string }>('carry/:key/arrive', { public: true, status: 200 }, ({ params, body }) => carryArrive(params.key, body ?? {}));

  // Signed in: the wallet
  r.post<{ code: string }>('scan/:code/claim', { status: 200 }, ({ params, user, body, req }) => claim(params.code, user, body ?? {}, req));
  r.get('wallet', ({ user }) => wallet(user));
  r.post('wallet/cashouts', ({ user, body }) => requestCashout(user, body ?? {}));

  // A brand
  r.get('brand', ({ user }) => brandInfo(user));
  r.post('brand', async ({ user, body, req }) => {
    const b = await createBrand(user, body ?? {});
    audit(user, { action: 'trace.brand_started', summary: `Started the brand “${b.name}” on Trace`, targetType: 'trace_brand', targetId: b.id }, req);
    return b;
  });
  r.patch('brand', ({ user, body }) => updateBrand(user, body ?? {}));
  r.get('overview', ({ user, query }) => overview(user, Math.min(90, Math.max(7, Number(first(query.days)) || 30))));
  r.get('products', ({ user }) => listProducts(user));
  r.post('products', ({ user, body }) => createProduct(user, body ?? {}));
  r.patch<{ id: string }>('products/:id', ({ user, params, body }) => updateProduct(user, params.id, body ?? {}));
  r.delete<{ id: string }>('products/:id', ({ user, params }) => deleteProduct(user, params.id));
  r.post<{ id: string }>('products/:id/batches', ({ user, params, body }) => createBatch(user, params.id, body ?? {}));
  r.get<{ id: string }>('batches/:id', ({ user, params }) => batchDetail(user, params.id));
  r.get<{ id: string }>('batches/:id/codes', ({ user, params, query }) => batchCodes(user, params.id, Number(first(query.from)) || 0, Number(first(query.count)) || 200));
  r.post<{ id: string }>('batches/:id/events', ({ user, params, body }) => addEvent(user, params.id, body ?? {}));
  r.post<{ id: string }>('batches/:id/carrier', { status: 200 }, ({ user, params, body }) => carrierLink(user, params.id, body ?? {}));
  r.post<{ code: string }>('codes/:code/flag', { status: 200 }, ({ user, params, body }) => flagCode(user, params.code, (body as { flagged?: unknown })?.flagged !== false));
  r.post('demo', ({ user }) => demo(user));
  r.get('campaigns', async ({ user }) => listCampaigns(await brandId(user)));
  r.post('campaigns', async ({ user, body }) => createCampaign(await brandId(user), user, body ?? {}));
  r.patch<{ id: string }>('campaigns/:id', async ({ user, params, body }) => setCampaignStatus(await brandId(user), params.id, (body as { status?: unknown })?.status));
  r.get('cashouts', async ({ user }) => brandCashouts(await brandId(user)));
  r.patch<{ id: string }>('cashouts/:id', async ({ user, params, body }) => decideCashout(await brandId(user), user, params.id, body ?? {}));
  r.get('map/market', ({ user, query }) => marketMap(user, Number(first(query.days)) || 30, first(query.product) || null));
  r.get('map/live', ({ user, query }) => liveScans(user, first(query.since)));
  r.get('map/tracking', ({ user }) => tracking(user));

  // The platform owner: every brand and its plan
  r.get('brands', { owner: true }, () => allBrands());
  r.patch<{ id: string }>('brands/:id/plan', { owner: true }, ({ params, body }) => setPlan(params.id, (body as { plan?: unknown })?.plan));
}
