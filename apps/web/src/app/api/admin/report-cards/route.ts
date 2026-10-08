import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { oneOf, str, text, type Body } from '@/server/body';
import { audit } from '@/server/audit';
import { ReportCardError, compileBatch, createRun, deleteRun, listRuns, setComment, setPublished } from '@/server/report-cards';

// Admin → Reports → Report cards (Stage 5 · B15.3; src/server/report-cards.ts).
// GET: the rounds. POST { action }: create, compile (next batch), comment, publish, unpublish, delete.

const ACTIONS = ['create', 'compile', 'comment', 'publish', 'unpublish', 'delete'] as const;

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ runs: await listRuns(), school: auth.org.name }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const b = ((await req.json().catch(() => null)) ?? {}) as Body;
  if (!oneOf(ACTIONS, b.action)) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  try {
    switch (b.action) {
      case 'create': {
        const run = await createRun({ title: b.title, from: b.from, to: b.to }, auth.org.name, auth.user.id);
        audit(auth.user, { action: 'report-cards.created', summary: `Started report cards “${run.title}”`, targetType: 'report-card-run', targetId: run.id }, req);
        return NextResponse.json(run);
      }
      case 'compile': return NextResponse.json(await compileBatch(text(b.runId), str(b.cursor) ?? null));
      case 'comment': return NextResponse.json(await setComment(text(b.cardId), b.comment));
      case 'publish':
      case 'unpublish': {
        const r = await setPublished(text(b.runId), b.action === 'publish');
        audit(auth.user, { action: `report-cards.${b.action}ed`, summary: `${b.action === 'publish' ? 'Published' : 'Took back'} report cards`, targetType: 'report-card-run', targetId: text(b.runId) }, req);
        return NextResponse.json(r);
      }
      case 'delete': return NextResponse.json(await deleteRun(text(b.runId)));
    }
  } catch (e) {
    if (e instanceof ReportCardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
