import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { oralReceiptPreview, setOralReceipt } from '@/server/oral';

// AI receipt for an oral check (Stage 5 · Q22): GET what the student would attach (their own record
// of AI help during the oral); POST { attach, declaredNone, note } attaches it, until it's marked.
type Ctx = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => oralReceiptPreview(user, (await params).id));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => setOralReceipt(user, (await params).id, ((await req.json().catch(() => null)) ?? {}) as Body));
