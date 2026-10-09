import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { deskAction, libraryDesk } from '@/server/library';

// The library desk (Stage 5 · B15.4). GET: counts, rules, late loans, fines. POST { action: 'issue' | 'return' | 'renew' | 'fine' | 'remind' | 'settings', … }. Needs library.manage.
export const GET = (req: Request) => route(req, (user) => libraryDesk(user));
export const POST = (req: Request) => route(req, async (user) => {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const out = await deskAction(user, b) as Record<string, unknown>;
  if (b.action === 'fine' || b.action === 'settings') audit(user, { action: `library.${String(b.action)}`, summary: b.action === 'fine' ? `Library fine marked ${String(out.fineStatus).toLowerCase()}` : 'Changed the library rules', targetType: 'library', targetId: typeof b.loanId === 'string' ? b.loanId : undefined }, req);
  return out;
});
