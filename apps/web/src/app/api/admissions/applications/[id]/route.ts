import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { applicationAction, applicationDetail } from '@/server/admissions';

// One application (Stage 5 · B15.1). GET: answers, documents, scores, history.
// POST { action: 'stage' | 'message' | 'note' | 'score' | 'offer' | 'respond' | 'enrol', … }.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => applicationDetail(user, (await params).id));
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => {
  const id = (await params).id;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const out = await applicationAction(user, id, b);
  if (b.action !== 'score' && b.action !== 'note') audit(user, { action: `admissions.${String(b.action)}`, summary: `Admissions: ${String(b.action)}${'stage' in out ? ` → ${String(out.stage)}` : ''}`, targetType: 'admission-application', targetId: id }, req);
  return out;
});
