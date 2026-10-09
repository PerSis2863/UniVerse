import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { undoImport } from '@/server/bulk-import';

// One bulk import (Stage 5 · B15.7). POST { action: 'undo' }: take it back (within 7 days).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => {
  const id = (await params).id;
  const out = await undoImport(user, id, await req.json().catch(() => ({})));
  audit(user, { action: 'import.undone', summary: 'Undid a bulk import', targetType: 'import', targetId: id, metadata: out.kept }, req);
  return out;
});
