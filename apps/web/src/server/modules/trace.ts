import type { Router } from '../router';
import { first } from '../body';
import { audit } from '../audit';
import { addEvent, batchCodes, batchDetail, claim, createBatch, createProduct, demo, flagCode, listProducts, mine, overview, scan, updateProduct } from '../trace';

// UniVerse Trace (src/server/trace.ts): every product gets a passport. Anyone can check a code
// (no sign-in); signed-in people earn points for genuine units; the brand (an admin) runs the rest.

export default function traceModule(router: Router) {
  const r = router.controller('trace');

  r.post<{ code: string }>('scan/:code', { public: true, status: 200 }, ({ params, body, user, req }) => scan(params.code, body ?? {}, user ?? null, req));
  r.post<{ code: string }>('scan/:code/claim', { status: 200 }, ({ params, user }) => claim(params.code, user));
  r.get('me', ({ user }) => mine(user));

  r.get('overview', { roles: ['ADMIN'] }, ({ user, query }) => overview(user, Math.min(90, Math.max(7, Number(first(query.days)) || 30))));
  r.get('products', { roles: ['ADMIN'] }, ({ user }) => listProducts(user));
  r.post('products', { roles: ['ADMIN'] }, async ({ user, body, req }) => {
    const p = await createProduct(user, body ?? {});
    audit(user, { action: 'trace.product_created', summary: `Added the product “${p.name}” to Trace`, targetType: 'trace_product', targetId: p.id }, req);
    return p;
  });
  r.patch<{ id: string }>('products/:id', { roles: ['ADMIN'] }, ({ user, params, body }) => updateProduct(user, params.id, body ?? {}));
  r.post<{ id: string }>('products/:id/batches', { roles: ['ADMIN'] }, async ({ user, params, body, req }) => {
    const b = await createBatch(user, params.id, body ?? {});
    audit(user, { action: 'trace.batch_created', summary: `Made a batch of ${b.quantity} codes (${b.label})`, targetType: 'trace_batch', targetId: b.id }, req);
    return b;
  });
  r.get<{ id: string }>('batches/:id', { roles: ['ADMIN'] }, ({ user, params }) => batchDetail(user, params.id));
  r.get<{ id: string }>('batches/:id/codes', { roles: ['ADMIN'] }, ({ user, params, query }) => batchCodes(user, params.id, Number(first(query.from)) || 0, Number(first(query.count)) || 200));
  r.post<{ id: string }>('batches/:id/events', { roles: ['ADMIN'] }, ({ user, params, body }) => addEvent(user, params.id, body ?? {}));
  r.post<{ code: string }>('codes/:code/flag', { roles: ['ADMIN'], status: 200 }, ({ user, params, body }) => flagCode(user, params.code, (body as { flagged?: unknown })?.flagged !== false));
  r.post('demo', { roles: ['ADMIN'] }, ({ user }) => demo(user));
}
