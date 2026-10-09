import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { importHistory, runImport } from '@/server/bulk-import';

// Bulk import from CSV (Stage 5 · B15.7; src/server/bulk-import.ts). GET: the last imports.
// POST { kind, rows, fileName? }: import (rows are checked again; rows with problems are left out).
export const GET = (req: Request) => route(req, (user) => importHistory(user));
export const POST = (req: Request) => route(req, async (user) => {
  const out = await runImport(user, await req.json().catch(() => ({})));
  const c = out.counts;
  audit(user, { action: 'import.done', summary: `Imported ${out.kind}: ${c.create} new, ${c.update} changed, ${c.invite} invited, ${c.enrol} enrolled`, targetType: 'import', targetId: out.id, metadata: c }, req);
  return out;
});
