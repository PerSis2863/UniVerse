import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { addAssets, assetList } from '@/server/registers';

// The equipment register (Stage 5 · B15.5; src/server/registers.ts). GET ?q=&status=&category=. POST: add items (with tags). Needs registers.manage.
export const GET = (req: Request) => route(req, (user) => assetList(user, new URL(req.url).searchParams));
export const POST = (req: Request) => route(req, async (user) => {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const out = await addAssets(user, b);
  audit(user, { action: 'registers.assets_added', summary: `Added ${out.tags.length} × ${String(b.name ?? '').slice(0, 60)} to the equipment register`, targetType: 'asset' }, req);
  return out;
});
