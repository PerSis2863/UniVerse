import { route } from '@/server/assignments';
import { previewImport } from '@/server/bulk-import';

// What a bulk import would do, row by row (Stage 5 · B15.7). POST { kind, rows }. Reads only, so
// the demo admin may use it too (src/server/auth.ts DEMO_ADMIN_WRITABLE).
export const POST = (req: Request) => route(req, async (user) => previewImport(user, await req.json().catch(() => ({}))));
