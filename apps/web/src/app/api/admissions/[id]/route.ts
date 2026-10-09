import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { roundAction, roundDetail } from '@/server/admissions';

// One admission round (Stage 5 · B15.1). GET ?stage=&q=: the round and its applications. POST { action: 'save' | 'close' | 'reopen' }.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => roundDetail(user, (await params).id, new URL(req.url).searchParams));
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => {
  const id = (await params).id;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const out = await roundAction(user, id, b);
  audit(user, { action: `admissions.round_${String(b.action)}`, summary: `Admission round: ${String(b.action)}`, targetType: 'admission-round', targetId: id }, req);
  return out;
});
